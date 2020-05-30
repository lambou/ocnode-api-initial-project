import { Request, Response } from "express";
import { v4 as uuidV4 } from "uuid";
import crypto from "crypto";
import HttpStatus from "../../../common/HttpStatus";
import IAuthCodeRequest from "../interfaces/IAuthCodeRequest";
import OauthClient, { IOauthClient } from "../models/OauthClient";
import OauthAuthCode from "../models/OauthAuthCode";
import ITokenRequest from "../interfaces/ITokenRequest";
import OauthDefaults, { IOauthDefaults } from "../OauthDefaults";
import OauthHelper from "../helpers/OauthHelper";
import UrlHelper from "../helpers/UrlHelper";
import ITokenError from "../interfaces/ITokenError";
import TokenGrantAuthorizationCodeHelper from "../helpers/TokenGrantAuthorizationCodeHelper";
import TokenGrantClientCredentialsHelper from "../helpers/TokenGrantClientCredentialsHelper";
import TokenGrantPasswordCredentialsHelper from "../helpers/TokenGrantPasswordCredentialsHelper";
import TokenGrantRefreshTokenHelper from "../helpers/TokenGrantRefreshTokenHelper";
import path from "path";
import IAuthorizationErrorResponse from "../interfaces/IAuthorizationErrorResponse";

class OauthController {
  oauthParams: IOauthDefaults;

  constructor() {
    this.oauthParams = OauthDefaults;
  }

  /**
   * Generate token
   * @param req request
   * @param res response
   */
  async callback(req: Request, res: Response) {
    return res.status(HttpStatus.Ok).json({
      query: req.query,
      body: req.body,
    });
  }

  /**
   * Generate token
   * @param req request
   * @param res response
   */
  token = async (req: Request, res: Response) => {
    // request data
    let data: ITokenRequest = req.body as ITokenRequest;

    // get basic auth header credentials
    let basicAuthCredentials = OauthHelper.getBasicAuthHeaderCredentials(req);

    // update credential if exist
    if (basicAuthCredentials) {
      data.client_id = basicAuthCredentials.client_id;
      data.client_secret = basicAuthCredentials.client_secret;
    }

    try {
      if (!data.client_id) {
        throw {
          status: HttpStatus.BadRequest,
          data: {
            error: "invalid_request",
            error_description:
              "The client_id is required. You can send it with client_secret in body or via Basic Auth header.",
          } as ITokenError,
        };
      }

      // load client
      const client = await OauthClient.findOne({ clientId: data.client_id });

      /**
       * Client has to exist
       */
      if (!client) {
        throw {
          status: HttpStatus.Unauthorized,
          data: {
            error: "invalid_client",
            error_description: "Unknown client",
          } as ITokenError,
        };
      }

      // Client revoked
      if (client.revokedAt) {
        throw {
          status: HttpStatus.Unauthorized,
          data: {
            error: "invalid_client",
            error_description:
              "The client related to this request has been revoked.",
          } as ITokenError,
        };
      }

      /**
       * Check scopes
       * ****************
       */
      if (data.scope && !client.validateScope(data.scope)) {
        throw {
          status: HttpStatus.BadRequest,
          data: {
            error: "invalid_scope",
            error_description:
              "The requested scope is invalid, unknown, malformed, or exceeds the scope granted.",
          } as ITokenError,
        };
      }

      if (client.clientType === "confidential" && !data.client_secret) {
        throw {
          status: HttpStatus.BadRequest,
          data: {
            error: "invalid_request",
            error_description:
              "The secret_secret is required for confidential client. You can send it with client_id in body or via Basic Auth header.",
          } as ITokenError,
        };
      }

      /**
       * Verify secret code if it exist
       */
      if (
        data.client_secret &&
        data.client_secret.length !== 0 &&
        !OauthHelper.verifyClientSecret({
          clientId: client.clientId,
          hash: data.client_secret,
          oauthHmacAlgorithm: this.oauthParams.OAUTH_HMAC_ALGORITHM,
          oauthSecretKey: this.oauthParams.OAUTH_SECRET_KEY,
        })
      ) {
        throw {
          status: HttpStatus.Unauthorized,
          data: {
            error: "invalid_client",
            error_description: "Invalid client secret.",
          } as ITokenError,
        };
      }

      switch (data.grant_type) {
        case "authorization_code":
          // Authorization Code Grant
          return TokenGrantAuthorizationCodeHelper.run(
            req,
            res,
            data,
            client,
            this.oauthParams
          );
        case "client_credentials":
          // Client Credentials Grant
          return TokenGrantClientCredentialsHelper.run(
            req,
            res,
            data,
            client,
            this.oauthParams
          );
        case "password":
          // Resource Owner Password Credentials
          return TokenGrantPasswordCredentialsHelper.run(
            req,
            res,
            data,
            client,
            this.oauthParams
          );
        case "refresh_token":
          // Refreshing an Access Token
          return TokenGrantRefreshTokenHelper.run(
            req,
            res,
            data,
            client,
            this.oauthParams
          );
        default:
          throw {
            status: HttpStatus.BadRequest,
            data: {
              error: "unsupported_grant_type",
              error_description:
                "The authorization grant type is not supported by the authorization server.",
            } as ITokenError,
          };
      }
    } catch (e) {
      if (e.status) {
        return res.status(e.status).json(e.data);
      } else {
        console.log(e);
        return res.status(HttpStatus.BadRequest).json({
          error: "server_error",
          error_description:
            "The authorization server encountered an unexpected condition that prevented it from fulfilling the request.",
        } as ITokenError);
      }
    }
  };

  /**
   * Purge expired and revoked token
   * @param req request
   * @param res response
   */
  async purge(req: Request, res: Response) {
    return res.status(HttpStatus.Ok).json({
      message: "Purge",
    });
  }

  /**
   * Get authorization dialog
   * @param req request
   * @param res response
   */
  dialog = async (req: Request, res: Response) => {
    // login path
    const authLoginPath = path.join(
      __dirname,
      "..",
      "views",
      "pages",
      "auth-login.ejs"
    );

    // request payload
    const payload = JSON.parse(
      Buffer.from(req.query.p, "base64").toString("ascii")
    ) as {
      oauthAuthCodeId: string;
      order?: "cancel";
      inputs?: {
        [key: string]: string;
      };
      error?: {
        message: string;
        errors: {
          [key: string]: string;
        };
      };
    };

    // load auth code
    const oauthCode = await OauthAuthCode.findById(payload.oauthAuthCodeId);

    // load scopes
    if (oauthCode) {
      /**
       * Authentification cancelled
       * ******************************
       */
      if (payload.order === "cancel") {
        return res.redirect(
          UrlHelper.injectQueryParams(oauthCode.redirectUri, {
            error: "access_denied",
            error_description: "The resource owner denied the request.",
            state: oauthCode.state,
          } as IAuthorizationErrorResponse)
        );
      } else {
        return res.render(authLoginPath, {
          providerName: this.oauthParams.providerName,
          currentYear: new Date().getFullYear(),
          oauthAuthCodeId: oauthCode._id,
          formAction: `${UrlHelper.getFullUrl(req)}/oauth/authorize`,
          cancelUrl: `${UrlHelper.getFullUrl(req)}/oauth/dialog?p=${Buffer.from(
            JSON.stringify({ oauthAuthCodeId: oauthCode._id, order: "cancel" })
          ).toString("base64")}`,
          error: payload.error,
          inputs: payload.inputs ?? {
            username: "",
            password: "",
          },
          client: {
            name: oauthCode.client.name,
            domaine: oauthCode.client.domaine,
            logo: oauthCode.client.logo,
            description: oauthCode.client.description,
            internal: oauthCode.client.internal,
            clientType: oauthCode.client.clientType,
            clientProfile: oauthCode.client.clientProfile,
            scope: oauthCode.client.scope,
          } as Partial<IOauthClient>,
        });
      }
    } else {
      return res.status(HttpStatus.BadRequest).json({
        error: "server_error",
        error_description:
          "The authorization server encountered an unexpected condition that prevented it from fulfilling the request.",
      } as IAuthorizationErrorResponse);
    }
  };

  /**
   * Get information about a token
   * @param req request
   * @param res response
   */
  async inspect(req: Request, res: Response) {
    return res.status(HttpStatus.Ok).json({
      message: "Inspect token",
    });
  }
}

export default new OauthController();
