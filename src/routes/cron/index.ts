import { FastifyPluginCallback } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { Server } from "http";
import transactionsCronRoute from "./transactions";

const cronRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.register(transactionsCronRoute);
  done();
};

export default cronRoutes;
