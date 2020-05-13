import { Request, Response, Application } from "express";
import authRoutes from "./auth.routes";
import userRoutes from "./user.routes";
import { NoreaAppRoutes } from "@noreajs/core";
import oauthRoutes from "../modules/oauth/routes/oauth.routes";

export default new NoreaAppRoutes({
    routes(app: Application): void {
        /**
         * Api home
         */
        app.get('/', (request: Request, response: Response) => {
            response.send({
                "title": "Ocnode Api initial project",
                "description": "Initial api based on ocnode framework",
                "contact": {
                    "name": "OvniCode Team",
                    "email": "team@ovnicode.com"
                }
            });
        });

        /**
         * Oauth routes
         */
        oauthRoutes(app);

        /**
         * Auth routes
         */
        authRoutes(app)

        /**
         * Users routes
         */
        userRoutes(app);
    },
    middlewares(app: Application): void {

    }
})