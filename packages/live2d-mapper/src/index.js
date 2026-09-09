/**
 * Live2D Mapper - Maps face/emotion data to Live2D model parameters
 * Supports:
 * 1. face-api.js emotion strings -> Live2D params (main)
 * 2. MediaPipe FaceMesh 468 points -> Live2D params (extended)
 */
// Main: face-api.js emotion -> Live2D params
const EMOTION_MAP = {
    happy: { ParamMouthOpenY: 0.6, ParamBrowLY: -0.3, ParamBrowRY: -0.3, ParamEyeLOpen: 1, ParamEyeROpen: 1 },
    sad: { ParamMouthOpenY: 0.2, ParamBrowLY: 0.5, ParamBrowRY: 0.5, ParamEyeLOpen: 0.6, ParamEyeROpen: 0.6 },
    angry: { ParamMouthOpenY: 0.5, ParamBrowLY: 0.6, ParamBrowRY: 0.6, ParamEyeLOpen: 0.8, ParamEyeROpen: 0.8 },
    surprised: { ParamMouthOpenY: 0.9, ParamBrowLY: -0.5, ParamBrowRY: -0.5, ParamEyeLOpen: 1.2, ParamEyeROpen: 1.2 },
    fearful: { ParamMouthOpenY: 0.4, ParamBrowLY: 0.3, ParamBrowRY: 0.3, ParamEyeLOpen: 0.7, ParamEyeROpen: 0.7 },
    disgusted: { ParamMouthOpenY: 0.2, ParamBrowLY: 0.4, ParamBrowRY: 0.4, ParamEyeLOpen: 0.6, ParamEyeROpen: 0.6 },
    neutral: { ParamMouthOpenY: 0, ParamBrowLY: 0, ParamBrowRY: 0, ParamEyeLOpen: 1, ParamEyeROpen: 1 },
};
export function emotionToLive2DParams(emotion) {
    const mapped = EMOTION_MAP[emotion] || EMOTION_MAP.neutral;
    return {
        ParamAngleX: 0,
        ParamAngleY: 0,
        ParamAngleZ: 0,
        ParamEyeLOpen: 1,
        ParamEyeROpen: 1,
        ParamMouthOpenY: 0,
        ParamBrowLY: 0,
        ParamBrowRY: 0,
        ...mapped,
    };
}
// Extended: MediaPipe FaceMesh 468 points -> Live2D params
const FACE_MESH_IDX = {
    NOSE_TIP: 1, NOSE_ROOT: 168,
    LEFT_EYE_OUTER: 33, LEFT_EYE_INNER: 133,
    RIGHT_EYE_OUTER: 362, RIGHT_EYE_INNER: 263,
    LEFT_EYE_TOP: 159, LEFT_EYE_BOTTOM: 145,
    RIGHT_EYE_TOP: 386, RIGHT_EYE_BOTTOM: 374,
    MOUTH_TOP: 0, MOUTH_BOTTOM: 17,
    MOUTH_LEFT: 61, MOUTH_RIGHT: 291,
    LEFT_BROW: 105, RIGHT_BROW: 334,
    CHIN: 152, FOREHEAD: 10,
};
function dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}
export function mapFaceMeshToLive2D(faceMesh) {
    const kp = faceMesh.keypoints;
    if (!kp || kp.length < 468) {
        return emotionToLive2DParams('neutral');
    }
    const eyeDist = dist(kp[FACE_MESH_IDX.LEFT_EYE_OUTER], kp[FACE_MESH_IDX.RIGHT_EYE_OUTER]);
    const faceHeight = dist(kp[FACE_MESH_IDX.FOREHEAD], kp[FACE_MESH_IDX.CHIN]);
    const pitch = Math.atan2(kp[FACE_MESH_IDX.NOSE_TIP].y - kp[FACE_MESH_IDX.NOSE_ROOT].y, faceHeight * 0.3) * (180 / Math.PI);
    const yaw = Math.atan2(kp[FACE_MESH_IDX.NOSE_TIP].x - kp[FACE_MESH_IDX.NOSE_ROOT].x, eyeDist * 0.5) * (180 / Math.PI);
    const roll = Math.atan2(kp[FACE_MESH_IDX.RIGHT_EYE_OUTER].y - kp[FACE_MESH_IDX.LEFT_EYE_OUTER].y, kp[FACE_MESH_IDX.RIGHT_EYE_OUTER].x - kp[FACE_MESH_IDX.LEFT_EYE_OUTER].x) * (180 / Math.PI);
    const leftEyeOpen = clamp(dist(kp[FACE_MESH_IDX.LEFT_EYE_TOP], kp[FACE_MESH_IDX.LEFT_EYE_BOTTOM]) / (eyeDist * 0.18), 0, 1.2);
    const rightEyeOpen = clamp(dist(kp[FACE_MESH_IDX.RIGHT_EYE_TOP], kp[FACE_MESH_IDX.RIGHT_EYE_BOTTOM]) / (eyeDist * 0.18), 0, 1.2);
    const mouthW = dist(kp[FACE_MESH_IDX.MOUTH_LEFT], kp[FACE_MESH_IDX.MOUTH_RIGHT]);
    const mouthOpen = mouthW > 0 ? clamp(dist(kp[FACE_MESH_IDX.MOUTH_TOP], kp[FACE_MESH_IDX.MOUTH_BOTTOM]) / mouthW * 1.5, 0, 1.2) : 0;
    const browL = clamp((kp[FACE_MESH_IDX.LEFT_BROW].y - kp[FACE_MESH_IDX.LEFT_EYE_TOP].y) / faceHeight * 8 - 0.5, -1, 1);
    const browR = clamp((kp[FACE_MESH_IDX.RIGHT_BROW].y - kp[FACE_MESH_IDX.RIGHT_EYE_TOP].y) / faceHeight * 8 - 0.5, -1, 1);
    return {
        ParamAngleX: clamp(pitch / 30, -1, 1),
        ParamAngleY: clamp(yaw / 30, -1, 1),
        ParamAngleZ: clamp(roll / 30, -1, 1),
        ParamEyeLOpen: leftEyeOpen,
        ParamEyeROpen: rightEyeOpen,
        ParamMouthOpenY: mouthOpen,
        ParamBrowLY: browL,
        ParamBrowRY: browR,
    };
}
// Apply params to pixi-live2d-display model
export function applyToLive2DModel(model, params) {
    if (!model?.internalModel?.coreModel)
        return;
    const core = model.internalModel.coreModel;
    const set = (id, v) => {
        try {
            core.setParameterValueById(id, v);
        }
        catch { /* ignore missing param */ }
    };
    set('ParamAngleX', params.ParamAngleX);
    set('ParamAngleY', params.ParamAngleY);
    set('ParamAngleZ', params.ParamAngleZ);
    set('ParamEyeLOpen', params.ParamEyeLOpen);
    set('ParamEyeROpen', params.ParamEyeROpen);
    set('ParamMouthOpenY', params.ParamMouthOpenY);
    set('ParamBrowLY', params.ParamBrowLY);
    set('ParamBrowRY', params.ParamBrowRY);
}
