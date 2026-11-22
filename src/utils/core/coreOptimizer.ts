export { getProfileRegionShares, scoreAndAllocateMonthlyStep } from '../../domain/core/scoring'
export type { MonthlyStepAllocation } from '../../domain/core/scoring'

export { diagnoseCoreGaps } from '../../domain/core/gapDiagnostics'
export type { CoreGapDiagnostic } from '../../domain/core/gapDiagnostics'

export {
  optimizeExistingCoreSparplan,
  projectSparplanTimeline,
  buildPhasedRoadmap,
} from '../../domain/core/roadmapPlanner'
export type {
  SparplanItem,
  ProjectionPoint,
  SparplanProjection,
  RoadmapPhase,
  CoreRoadmap,
} from '../../domain/core/roadmapPlanner'

export { optimizeCoreOrders } from '../../domain/core/orderOptimizer'
export type { OrderRecommendation, OptimizationResult } from '../../domain/core/orderOptimizer'
