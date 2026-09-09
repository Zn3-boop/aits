/**
 * ============================================================
 *  Speaking Micro Expressions — 说话时微表情系统
 * ============================================================
 *
 * 功能：
 * 1. 说话过程中的动态表情层（叠加在基础情绪之上，不覆盖主情绪）
 * 2. 自动眨眼（自然节奏，不是固定间隔）
 * 3. 眼球微动 / 扫视（模拟真实视线移动）
 * 4. 轻微头部摆动（配合说话节奏）
 * 5. 重音处的微表情强调（抬眉、轻微点头）
 * 6. 句间停顿过渡（不是硬切表情）
 * 7. 呼吸起伏（已有的基础上增强自然度）
 *
 * 使用方式：
 *   import { speakingMicroExpr } from './speakingMicroExpressions';
 *
 *   // 初始化，传入驱动回调
 *   speakingMicroExpr.init({
 *     setParam: (id, value) => live2dDriver.setOverrideParam(id, value),
 *     addParam: (id, value) => live2dDriver.addParam(id, value), // 叠加模式
 *   });
 *
 *   // 说话开始时启动
 *   speakingMicroExpr.startSpeaking();
 *
 *   // 说话结束时停止
 *   speakingMicroExpr.stopSpeaking();
 *
 *   // 设置当前基础情绪（微表情会叠加在上面）
 *   speakingMicroExpr.setBaseEmotion('happy');
 *
 *   // 重音标记（遇到重读词时调用，增强表现力）
 *   speakingMicroExpr.triggerAccent();
 * ============================================================
 */

import { logger } from '../utils/logger';

export type BaseEmotion =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'fearful'
  | 'disgusted'
  | 'shy'
  | 'warm'
  | 'tsundere'
  | 'concerned'
  | 'sleepy';

export interface MicroExprOptions {
  /** 设置参数（覆盖模式） */
  setParam?: (id: string, value: number) => void;
  /** 叠加参数（addParameterValueById 模式） */
  addParam?: (id: string, value: number) => void;
  /** 眨眼频率倍率，1=正常，0.5=慢，2=快 */
  blinkRate?: number;
  /** 整体活跃度，1=正常，0.5=安静，2=活跃 */
  activityLevel?: number;
}

interface AccentEvent {
  time: number;
  intensity: number;
  type: 'brow' | 'nod' | 'eye';
}

export class SpeakingMicroExpressions {
  private options: Required<Omit<MicroExprOptions, 'setParam' | 'addParam'>> & {
    setParam?: MicroExprOptions['setParam'];
    addParam?: MicroExprOptions['addParam'];
  } = {
    blinkRate: 1,
    activityLevel: 1,
  };

  private isSpeaking = false;
  private isActive = false;
  private animationFrame: number | null = null;
  private lastTime = 0;

  // —— 基础情绪 ——
  private baseEmotion: BaseEmotion = 'neutral';

  // —— 眨眼状态 ——
  private nextBlinkTime = 0;
  private blinkProgress = 0; // 0=睁眼, 1=闭眼
  private blinkDuration = 150; // ms
  private isBlinking = false;
  private minBlinkInterval = 2500;
  private maxBlinkInterval = 6000;

  // —— 眼球运动 ——
  private eyeTargetX = 0;
  private eyeTargetY = 0;
  private eyeCurrentX = 0;
  private eyeCurrentY = 0;
  private nextEyeMoveTime = 0;
  private minSaccadeInterval = 800;
  private maxSaccadeInterval = 2500;

  // —— 头部微动 ——
  private headTargetX = 0;
  private headTargetY = 0;
  private headTargetZ = 0;
  private headCurrentX = 0;
  private headCurrentY = 0;
  private headCurrentZ = 0;
  private nextHeadMoveTime = 0;

  // —— 呼吸 ——
  private breathPhase = 0;
  private breathSpeed = 0.8; // 呼吸周期倍率

  // —— 重音事件 ——
  private accentEvents: AccentEvent[] = [];
  private accentBrowBoost = 0;
  private accentNodBoost = 0;

  // —— 说话活跃度（基于语速/音量动态调整）——
  private speechEnergy = 0;
  private targetSpeechEnergy = 0;

  // ===== 初始化 =====

  init(options: MicroExprOptions = {}): void {
    this.options = { ...this.options, ...options };
    // 启动后台微表情（即使不说话也有轻微动作）
    this.startIdle();
    logger.log('[SpeakingMicroExpr] ✅ 微表情系统已初始化');
  }

  // ===== 公共 API =====

  /**
   * 开始说话模式：提高活跃度，加快眨眼和头部动作
   */
  startSpeaking(): void {
    if (this.isSpeaking) return;
    this.isSpeaking = true;
    this.targetSpeechEnergy = 0.7;
    this.minBlinkInterval = 1800;
    this.maxBlinkInterval = 4000;
    this.minSaccadeInterval = 500;
    this.maxSaccadeInterval = 1500;
    logger.log('[SpeakingMicroExpr] 🗣️ 进入说话模式');
  }

  /**
   * 停止说话：回到空闲模式
   */
  stopSpeaking(): void {
    if (!this.isSpeaking) return;
    this.isSpeaking = false;
    this.targetSpeechEnergy = 0;
    this.minBlinkInterval = 2500;
    this.maxBlinkInterval = 6000;
    this.minSaccadeInterval = 800;
    this.maxSaccadeInterval = 2500;
    // 重置重音
    this.accentEvents = [];
    logger.log('[SpeakingMicroExpr] 😶 返回空闲模式');
  }

  /**
   * 设置当前基础情绪
   * 微表情会根据基础情绪调整风格
   */
  setBaseEmotion(emotion: BaseEmotion): void {
    this.baseEmotion = emotion;
    // 根据情绪调整呼吸
    switch (emotion) {
      case 'happy':
      case 'excited':
        this.breathSpeed = 1.1;
        break;
      case 'sad':
      case 'sleepy':
        this.breathSpeed = 0.6;
        break;
      case 'angry':
      case 'fearful':
      case 'tsundere':
        this.breathSpeed = 1.3;
        break;
      default:
        this.breathSpeed = 0.8;
    }
  }

  /**
   * 更新说话能量（音量/语速），用于动态调整微表情强度
   * @param energy 0-1
   */
  updateSpeechEnergy(energy: number): void {
    this.targetSpeechEnergy = Math.max(0, Math.min(1, energy));
  }

  /**
   * 触发一次重音强调（在重读词时调用）
   * @param intensity 强度 0-1
   */
  triggerAccent(intensity = 0.6): void {
    const types: AccentEvent['type'][] = ['brow', 'nod', 'eye'];
    const type = types[Math.floor(Math.random() * types.length)];
    this.accentEvents.push({
      time: performance.now(),
      intensity: Math.max(0.3, Math.min(1, intensity)),
      type,
    });
    // 最多保留 5 个
    if (this.accentEvents.length > 5) {
      this.accentEvents.shift();
    }
  }

  /**
   * 触发一次自然眨眼
   */
  triggerBlink(duration = 120): void {
    this.isBlinking = true;
    this.blinkProgress = 0;
    this.blinkDuration = duration;
  }

  /**
   * 设置活跃度
   */
  setActivityLevel(level: number): void {
    this.options.activityLevel = Math.max(0.2, Math.min(2, level));
  }

  // ===== 内部：主循环 =====

  private startIdle(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.lastTime = performance.now();
    this.nextBlinkTime = this.lastTime + this.randomRange(this.minBlinkInterval, this.maxBlinkInterval);
    this.nextEyeMoveTime = this.lastTime + this.randomRange(this.minSaccadeInterval, this.maxSaccadeInterval);
    this.nextHeadMoveTime = this.lastTime + 2000;

    const loop = (now: number) => {
      if (!this.isActive) return;

      const dt = now - this.lastTime;
      this.lastTime = now;

      this.update(dt, now);

      this.animationFrame = requestAnimationFrame(loop);
    };

    this.animationFrame = requestAnimationFrame(loop);
  }

  private update(dt: number, now: number): void {
    const activity = this.options.activityLevel;

    // —— 平滑说话能量 ——
    this.speechEnergy += (this.targetSpeechEnergy - this.speechEnergy) * 0.05;

    // —— 眨眼 ——
    this.updateBlink(dt, now, activity);

    // —— 眼球运动 ——
    this.updateEyeMovement(dt, now, activity);

    // —— 头部微动 ——
    this.updateHeadMovement(dt, now, activity);

    // —— 呼吸 ——
    this.updateBreath(dt, activity);

    // —— 重音事件 ——
    this.updateAccents(dt, now);

    // —— 应用参数 ——
    this.applyParams();
  }

  // ===== 眨眼 =====

  private updateBlink(dt: number, now: number, _activity: number): void {
    if (this.isBlinking) {
      // 眨眼动画：0 → 1 → 0
      const blinkSpeed = 2 / (this.blinkDuration / dt);
      if (this.blinkProgress < 1) {
        // 闭眼阶段（较快）
        this.blinkProgress = Math.min(1, this.blinkProgress + blinkSpeed * 1.5);
      } else {
        // 睁眼阶段（较慢）
        this.blinkProgress += blinkSpeed * 0.8;
        if (this.blinkProgress >= 2) {
          this.isBlinking = false;
          this.blinkProgress = 0;
          this.nextBlinkTime =
            now +
            this.randomRange(this.minBlinkInterval, this.maxBlinkInterval) *
              (this.speechEnergy > 0.3 ? 0.7 : 1);
        }
      }
    } else if (now >= this.nextBlinkTime) {
      // 情绪影响：说话时更频繁眨眼，困倦时更少
      let shouldBlink = true;

      // 困倦时减少眨眼
      if (this.baseEmotion === 'sleepy' && Math.random() > 0.4) {
        shouldBlink = false;
        this.nextBlinkTime = now + 1500;
      }

      if (shouldBlink) {
        this.isBlinking = true;
        this.blinkProgress = 0;
        this.blinkDuration = 100 + Math.random() * 80;
      }
    }

    // 计算眼睛开合度
    // 用 cos 曲线让眨眼更自然：中间(progress=1)完全闭上
    const blinkAmount =
      this.isBlinking
        ? 0.5 - 0.5 * Math.cos(Math.min(this.blinkProgress, 1) * Math.PI)
        : 0;

    // 困倦时眼睛天然半睁
    const sleepyFactor = this.baseEmotion === 'sleepy' ? 0.5 : 0;

    const eyeOpenAmount = 1 - blinkAmount - sleepyFactor * 0.5;
    const eyeOpenValue = Math.max(0, eyeOpenAmount);

    // 开心时的笑眼叠加
    const happyFactor =
      this.baseEmotion === 'happy' || this.baseEmotion === 'warm' ? 0.3 : 0;
    const eyeSmileValue = happyFactor + this.accentBrowBoost * 0.2;

    this.setParam('eyeLOpen', eyeOpenValue);
    this.setParam('eyeROpen', eyeOpenValue);

    if (happyFactor > 0 || this.accentBrowBoost > 0) {
      this.setParam('eyeLSmile', Math.min(1, eyeSmileValue));
      this.setParam('eyeRSmile', Math.min(1, eyeSmileValue));
    }
  }

  // ===== 眼球运动 =====

  private updateEyeMovement(dt: number, now: number, activity: number): void {
    // 检查是否需要新的扫视
    if (now >= this.nextEyeMoveTime) {
      this.nextEyeMoveTime =
        now +
        this.randomRange(this.minSaccadeInterval, this.maxSaccadeInterval) / activity;

      // 生成新目标（随机偏移）
      const maxOffset = this.isSpeaking ? 0.4 : 0.25;
      this.eyeTargetX = (Math.random() * 2 - 1) * maxOffset;
      this.eyeTargetY = (Math.random() * 2 - 1) * maxOffset * 0.8;

      // 有时看向说话方向（模拟思考时视线偏移）
      if (this.isSpeaking && Math.random() < 0.3) {
        this.eyeTargetY -= 0.15; // 说话时偶尔往下看
      }

      // 害羞时眼睛往下看
      if (this.baseEmotion === 'shy' && Math.random() < 0.6) {
        this.eyeTargetY += 0.2;
        this.eyeTargetX = (Math.random() - 0.5) * 0.1;
      }
    }

    // 平滑移动（扫视很快，但我们给个小缓动）
    const saccadeSpeed = 0.15;
    this.eyeCurrentX += (this.eyeTargetX - this.eyeCurrentX) * saccadeSpeed;
    this.eyeCurrentY += (this.eyeTargetY - this.eyeCurrentY) * saccadeSpeed;

    this.setParam('eyeBallX', this.eyeCurrentX);
    this.setParam('eyeBallY', this.eyeCurrentY);
  }

  // ===== 头部微动 =====

  private updateHeadMovement(dt: number, now: number, activity: number): void {
    if (now >= this.nextHeadMoveTime) {
      this.nextHeadMoveTime = now + this.randomRange(1500, 4000) / activity;

      const maxHeadX = this.isSpeaking ? 4 : 2;
      const maxHeadY = this.isSpeaking ? 3 : 1.5;
      const maxHeadZ = this.isSpeaking ? 3 : 1.5;

      this.headTargetX = (Math.random() * 2 - 1) * maxHeadX;
      this.headTargetY = (Math.random() * 2 - 1) * maxHeadY;
      this.headTargetZ = (Math.random() * 2 - 1) * maxHeadZ;

      // 开心时偶尔点头
      if (this.baseEmotion === 'happy' && Math.random() < 0.3) {
        this.headTargetY += 2;
      }

      // 害羞时歪头
      if (this.baseEmotion === 'shy' && Math.random() < 0.5) {
        this.headTargetZ += 5;
        this.headTargetY += 2;
      }
    }

    // 平滑（头部移动较慢）
    const headSpeed = 0.03;
    this.headCurrentX += (this.headTargetX - this.headCurrentX) * headSpeed;
    this.headCurrentY += (this.headTargetY - this.headCurrentY) * headSpeed;
    this.headCurrentZ += (this.headTargetZ - this.headCurrentZ) * headSpeed;

    // 重音点头叠加
    const nodOffset = this.accentNodBoost * 3;

    this.setParam('angleX', this.headCurrentX);
    this.setParam('angleY', this.headCurrentY + nodOffset);
    this.setParam('angleZ', this.headCurrentZ);

    // 身体跟随（轻微的身体摆动）
    this.addParam('bodyAngleX', this.headCurrentX * 0.3);
    this.addParam('bodyAngleY', (this.headCurrentY + nodOffset) * 0.2);
  }

  // ===== 呼吸 =====

  private updateBreath(dt: number, activity: number): void {
    this.breathPhase += (dt / 1000) * this.breathSpeed * activity * 0.5;
    const breathAmount = Math.sin(this.breathPhase) * 0.5 + 0.5; // 0-1

    // 呼吸影响：身体Y轴轻微起伏 + 胸口
    const bodyYBreath = breathAmount * 0.5;
    this.addParam('bodyAngleY', bodyYBreath);
  }

  // ===== 重音事件 =====

  private updateAccents(dt: number, now: number): void {
    // 衰减重音效果
    this.accentBrowBoost *= 0.92;
    this.accentNodBoost *= 0.9;

    // 处理新事件
    const activeDuration = 300; // 重音效果持续 300ms
    for (let i = this.accentEvents.length - 1; i >= 0; i--) {
      const event = this.accentEvents[i];
      const elapsed = now - event.time;

      if (elapsed > activeDuration) {
        this.accentEvents.splice(i, 1);
        continue;
      }

      // 钟形曲线：中间最强
      const t = elapsed / activeDuration; // 0-1
      const intensity = event.intensity * Math.exp(-Math.pow(t - 0.3, 2) * 20);

      switch (event.type) {
        case 'brow':
          this.accentBrowBoost = Math.max(this.accentBrowBoost, intensity * 0.5);
          break;
        case 'nod':
          this.accentNodBoost = Math.max(this.accentNodBoost, intensity * 0.7);
          break;
        case 'eye':
          // 眼睛睁大一下
          // 这个通过 blink 系统不太好叠加，先忽略
          break;
      }
    }

    // 眉毛抬升叠加
    if (this.accentBrowBoost > 0.01) {
      this.addParam('browLY', this.accentBrowBoost);
      this.addParam('browRY', this.accentBrowBoost);
    }
  }

  // ===== 参数应用 =====

  private setParam(id: string, value: number): void {
    this.options.setParam?.(this.resolveParamId(id), value);
  }

  private addParam(id: string, value: number): void {
    this.options.addParam?.(this.resolveParamId(id), value);
  }

  /**
   * 将简短参数名转换为可能的 Live2D 参数名
   * 这里只做简单映射，详细的命名兼容由 driver 的 resolveParamId 处理
   */
  private resolveParamId(shortId: string): string {
    // 使用 ParamXxx 格式，driver 会自动转换为实际格式
    const map: Record<string, string> = {
      eyeLOpen: 'ParamEyeLOpen',
      eyeROpen: 'ParamEyeROpen',
      eyeLSmile: 'ParamEyeLSmile',
      eyeRSmile: 'ParamEyeRSmile',
      eyeBallX: 'ParamEyeBallX',
      eyeBallY: 'ParamEyeBallY',
      browLY: 'ParamBrowLY',
      browRY: 'ParamBrowRY',
      angleX: 'ParamAngleX',
      angleY: 'ParamAngleY',
      angleZ: 'ParamAngleZ',
      bodyAngleX: 'ParamBodyAngleX',
      bodyAngleY: 'ParamBodyAngleY',
      bodyAngleZ: 'ParamBodyAngleZ',
      mouthOpen: 'ParamMouthOpenY',
      mouthForm: 'ParamMouthForm',
      cheek: 'ParamCheek',
    };
    return map[shortId] || `Param${shortId.charAt(0).toUpperCase()}${shortId.slice(1)}`;
  }

  private applyParams(): void {
    // 参数已经在各个 update 函数中实时设置了
    // 这里预留做一些整合逻辑
  }

  // ===== 工具函数 =====

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.isActive = false;
    this.isSpeaking = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * 获取当前状态（调试用）
   */
  getState() {
    return {
      isSpeaking: this.isSpeaking,
      baseEmotion: this.baseEmotion,
      speechEnergy: this.speechEnergy,
      eye: { x: this.eyeCurrentX, y: this.eyeCurrentY },
      head: { x: this.headCurrentX, y: this.headCurrentY, z: this.headCurrentZ },
      blink: this.isBlinking ? this.blinkProgress : 0,
      breath: this.breathPhase,
    };
  }
}

// 单例
export const speakingMicroExpr = new SpeakingMicroExpressions();