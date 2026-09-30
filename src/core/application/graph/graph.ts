import type { NexusGraph } from '@/libs/graph/graph.types';
import { type GraphPathParams, NexusGraphService } from '@/services/nexus/graph/graph';

export class GraphApplication {
  static async fetchPath(params: GraphPathParams): Promise<NexusGraph> {
    return await NexusGraphService.path(params);
  }
}
