import OauthDefaults, { IOauthDefaults } from "../OauthDefaults";
import { Request, Response } from "express";
import ITokenRequest from "../interfaces/ITokenRequest";
import OauthHelper from "../helpers/OauthHelper";
import HttpStatus from "../../../common/HttpStatus";
import IOauthError from "../interfaces/IOauthError";
import OauthClient from "../models/OauthClient";
import TokenGrantAuthorizationCodeHelper from "../helpers/TokenGrantAuthorizationCodeHelper";
import TokenGrantClientCredentialsHelper from "../helpers/TokenGrantClientCredentialsHelper";
import TokenGrantPasswordCredentialsHelper from "../helpers/TokenGrantPasswordCredentialsHelper";
import TokenGrantRefreshTokenHelper from "../helpers/TokenGrantRefreshTokenHelper";

class AccessTokenController {
  oauthParams: IOauthDefaults;

  constructor() {
    this.oauthParams = OauthDefaults;
  }

  /**
   * Generate token
   * @param req request
   * @param res response
   */
  token = async (req: Request, res: Response) => {
    // request data
    let data = req.body as ITokenRequest;

    // get basic auth header credentials
    let basicAuthCredentials = OauthHelper.getBasicAuthHeaderCredentials(req);

    // update credential if exist
    if (basicAuthCredentials) {
      data.client_id = basicAuthCredentials.client_id;
      data.client_secret = basicAuthCredentials.client_secret;
    }

    try {
      if (!data.client_id) {
        return OauthHelper.throwError(res, {
          error: "invalid_request",
          error_description:
            "The client_id is required. You can send it with client_secret in body or via Basic Auth header.",
        });
      }

      // load client
      const client = await OauthClient.findOne({ clientId: data.client_id });

      /**
       * Client has to exist
       */
      if (!client) {
        return OauthHelper.throwError(res, {
          error: "invalid_client",
          error_description: "Unknown client",
        });
      }

      // Client revoked
      if (client.revokedAt) {
        return OauthHelper.throwError(res, {
          error: "invalid_client",
          error_description:
            "The client related to this request has been revoked.",
        });
      }

      /**
       * Check scopes
       * ****************
       */
      if (data.scope && !client.validateScope(data.scope)) {
        return OauthHelper.throwError(res, {
          error: "invalid_scope",
          error_description:
            "The requested scope is invalid, unknown, malformed, or exceeds the scope granted.",
        });
      }

      if (client.clientType === "confidential" && !data.client_secret) {
        return OauthHelper.throwError(res, {
          error: "invalid_request",
          error_description:
            "The secret_secret is required for confidential client. You can send it with client_id in body or via Basic Auth header.",
        });
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
        return OauthHelper.throwError(res, {
          error: "invalid_client",
          error_description: "Invalid client secret.",
        });
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
          return OauthHelper.throwError(res, {
            error: "unsupported_grant_type",
            error_description:
              "The authorization grant type is not supported by the authorization server.",
          });
      }
    } catch (e) {
      console.log(e);
      return OauthHelper.throwError(res, {
        error: "server_error",
        error_description:
          "The authorization server encountered an unexpected condition that prevented it from fulfilling the request.",
      });
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

export default new AccessTokenController();