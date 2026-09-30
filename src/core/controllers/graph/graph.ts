import { GraphApplication } from '@/application/graph/graph';
import type { NexusGraph } from '@/libs/graph/graph.types';
import type { GraphPathParams } from '@/services/nexus/graph/graph';

export class GraphController {
  static async fetchPath(params: GraphPathParams): Promise<NexusGraph> {
    return await GraphApplication.fetchPath(params);
  }
}
