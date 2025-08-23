import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { ErrorsService } from './errors.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly errors: ErrorsService) {}
  async catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request: any = ctx.getRequest();
    try {
      await this.errors.ingest({
        source: 'backend',
        level: 'error',
        name: exception?.name,
        message: exception?.message || 'Unhandled error',
        stack: exception?.stack,
        path: request?.path,
        method: request?.method,
        userId: request?.user?.id,
        tenantId: request?.user?.tenantId,
        userAgent: request?.headers?.['user-agent'],
        context: { query: request?.query, body: sanitize(request?.body) },
      });
    } catch (e) {
      // swallow logging errors
    }
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload: any = { statusCode: status, message: exception?.message || 'Internal error' };
    response.status(status).json(payload);
  }
}

function sanitize(body: any) {
  if (!body || typeof body !== 'object') return body;
  const redacted = ['password', 'token', 'authorization'];
  const out: any = {};
  for (const [k, v] of Object.entries(body)) {
    if (redacted.includes(k.toLowerCase())) out[k] = '[REDACTED]'; else out[k] = v;
  }
  return out;
}
