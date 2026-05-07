import { useTerritoryStore } from '../territoryStore';

export const usePipelineStages = () => useTerritoryStore((s) => s.pipelineStages);
export const usePipelineStageOrder = () => useTerritoryStore((s) => s.pipelineStageOrder);
export const usePipelineStage = (id: string) => useTerritoryStore((s) => s.pipelineStages[id]);
