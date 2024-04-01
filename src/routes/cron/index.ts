import { FastifyPluginCallback } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { Server } from "http";
import processTransactionsCronRoute from "./process-transactions";
import unlockCellsCronRoute from "./unlock-cells";

const cronRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.register(processTransactionsCronRoute);
  fastify.register(unlockCellsCronRoute);
  done();
};

export default cronRoutes;
