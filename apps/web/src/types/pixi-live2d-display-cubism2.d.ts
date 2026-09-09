declare module 'pixi-live2d-display/lib/cubism2' {
  interface CoreModel {
    setParameterValueById(id: string, value: number): void;
    getParameterIndex(id: string): number;
  }

  interface InternalModel {
    coreModel: CoreModel;
  }

  interface Live2DModelInstance {
    internalModel: InternalModel;
  }

  const Live2DModel: new () => Live2DModelInstance;
  export { Live2DModel };
  export default Live2DModel;
}