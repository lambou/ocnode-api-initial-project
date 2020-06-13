import { Application } from "express"
import authController from "../controllers/auth.controller"
import { Oauth } from "@noreajs/oauth-v2-provider-mongoose"

export default (app: Application) => {
    /**
     * Register
     */
    app.route('/register').post([
        authController.register
    ])

    /**
     * Update account locale
     */
    app.route('/account/update/locale').put([
        Oauth.authorize(),
        authController.updateLocale
    ])

    /**
     * Update account
     */
    app.route('/account/update').put([
        Oauth.authorize(),
        authController.updateAccount
    ])

}