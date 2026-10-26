import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { AuthService } from "./auth";

@Injectable()
export class UserUploadGuard implements CanActivate {
  constructor(@Inject(AuthService) private auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    await this.auth.user(context.switchToHttp().getRequest());
    return true;
  }
}

@Injectable()
export class AdminUploadGuard implements CanActivate {
  constructor(@Inject(AuthService) private auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    await this.auth.admin(context.switchToHttp().getRequest(), "content");
    return true;
  }
}
