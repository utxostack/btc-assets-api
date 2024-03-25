import { AxiosInstance } from 'axios';
import pino from 'pino';

export function addLoggerInterceptor(request: AxiosInstance, logger: pino.BaseLogger) {
  request.interceptors.request.use((config) => {
    logger.debug(`[${config.url}] ${JSON.stringify(config.data)}`);
    return config;
  });

  request.interceptors.response.use(
    (response) => {
      logger.debug(`[${response.config.url}] ${response.status} ${JSON.stringify(response.data)}`);
      return response;
    },
    (error) => {
      logger.error(`${error.response?.status} ${JSON.stringify(error.response?.data)}`);
      return Promise.reject(error);
    },
  );
}
