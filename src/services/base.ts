import axios, { AxiosInstance } from 'axios';
import { FastifyBaseLogger } from 'fastify';

export abstract class BaseRequestService {
  protected request: AxiosInstance;

  constructor(baseURL: string, headers?: Record<string, string>) {
    this.request = axios.create({
      baseURL,
      headers,
    });
  }

  public setLogger(logger: FastifyBaseLogger) {
    const constructor = this.constructor.name;
    this.request.interceptors.request.use((config) => {
      logger.info(`[${constructor}] ${JSON.stringify(config.data)}`);
      return config;
    });

    this.request.interceptors.response.use(
      (response) => {
        logger.info(`[${constructor}] ${response.status} ${JSON.stringify(response.data)}`);
        return response;
      },
      (error) => {
        logger.error(
          `[${constructor}] ${error.response?.status} ${JSON.stringify(error.response?.data)}`,
        );
        return Promise.reject(error);
      },
    );
  }
}
