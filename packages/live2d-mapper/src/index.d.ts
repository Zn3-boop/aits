/**
 * Live2D Mapper - Maps face/emotion data to Live2D model parameters
 * Supports:
 * 1. face-api.js emotion strings -> Live2D params (main)
 * 2. MediaPipe FaceMesh 468 points -> Live2D params (extended)
 */
export interface FaceKeypoint {
    x: number;
    y: number;
    z: number;
}
export interface FaceMeshResult {
    keypoints: FaceKeypoint[];
    box?: {
        xMin: number;
        yMin: number;
        xMax: number;
        yMax: number;
    };
}
export interface Live2DExpressionParams {
    ParamAngleX: number;
    ParamAngleY: number;
    ParamAngleZ: number;
    ParamEyeLOpen: number;
    ParamEyeROpen: number;
    ParamMouthOpenY: number;
    ParamBrowLY: number;
    ParamBrowRY: number;
}
export declare function emotionToLive2DParams(emotion: string): Live2DExpressionParams;
export declare function mapFaceMeshToLive2D(faceMesh: FaceMeshResult): Live2DExpressionParams;
export declare function applyToLive2DModel(model: any, params: Live2DExpressionParams): void;
//# sourceMappingURL=index.d.ts.map