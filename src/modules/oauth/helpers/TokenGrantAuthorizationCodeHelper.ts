import { Request, Response } from "express";
import crypto from "crypto";
import { IOauthDefaults } from "../OauthDefaults";
import HttpStatus from "../../../common/HttpStatus";
import IToken from "../interfaces/IToken";
import OauthAuthCode from "../models/OauthAuthCode";
import moment from "moment";
import ITokenRequest from "../interfaces/ITokenRequest";
import { toASCII } from "punycode";
import IOauthError from "../interfaces/IOauthError";
import { IOauthClient } from "../models/OauthClient";

class TokenGrantAuthorizationCodeHelper {
  /**
   * Get Authorization Code Grant
   *
   * @param req request
   * @param res response
   * @param data token request data
   * @param client oauth client
   * @param oauthParams oauth params
   */
  static async run(
    req: Request,
    res: Response,
    data: ITokenRequest,
    client: IOauthClient,
    oauthParams: IOauthDefaults
  ) {
    try {
      /**
       * AUTHORIZATION CODE VALIDATION
       * *********************************
       */

      // load authoriation token
      const oauthCode = await OauthAuthCode.findOne({
        client: client._id,
        authorizationCode: data.code,
      });

      if (oauthCode) {
        if (moment().isAfter(oauthCode.expiresAt)) {
          throw {
            status: HttpStatus.BadRequest,
            data: {
              error: "invalid_grant",
              error_description:
                "The authorization code has been expired. Try to get another one.",
            } as IOauthError,
          };
        } else if (oauthCode.revokedAt) {
          throw {
            status: HttpStatus.BadRequest,
            data: {
              error: "invalid_grant",
              error_description:
                "The authorization code has been revoked. Try to get another one.",
            } as IOauthError,
          };
        } else {
          /**
           * Redirect URI must match
           */
          if (oauthCode.redirectUri !== data.redirect_uri) {
            throw {
              status: HttpStatus.BadRequest,
              data: {
                error: "invalid_grant",
                error_description: `The redirect_uri parameter must be identical to the one included in the authorization request.`,
              } as IOauthError,
            };
          }

          /**
           * Code verifier check
           */
          if (oauthCode.codeChallenge) {
            if (!data.code_verifier) {
              throw {
                status: HttpStatus.BadRequest,
                data: {
                  error: "invalid_request",
                  error_description: `The "code_verifier" is required.`,
                } as IOauthError,
              };
            } else {
              switch (oauthCode.codeChallengeMethod) {
                case "plain":
                  if (data.code_verifier !== oauthCode.codeChallenge) {
                    throw {
                      status: HttpStatus.BadRequest,
                      data: {
                        error: "invalid_grant",
                        error_description: `Code verifier and code challenge are not identical.`,
                      } as IOauthError,
                    };
                  }
                  break;
                case "S256":
                  // code here
                  const hashed = crypto
                    .createHash("sha256")
                    .update(toASCII(data.code_verifier))
                    .digest("base64")
                    .replace(/=/g, "")
                    .replace(/\+/g, "-")
                    .replace(/\//g, "_");

                  if (hashed !== oauthCode.codeChallenge) {
                    throw {
                      status: HttpStatus.BadRequest,
                      data: {
                        error: "invalid_grant",
                        error_description: `Hashed code verifier and code challenge are not identical.`,
                      } as IOauthError,
                    };
                  }

                  break;
              }
            }
          }

          /**
           * Generate tokens
           * ******************************
           */
          const tokens = await client.newAccessToken({
            req: req,
            oauthParams: oauthParams,
            grant: "authorization_code",
            scope: oauthCode.scope,
            subject: oauthCode.userId,
          });

          return res.status(HttpStatus.Ok).json({
            access_token: tokens.token,
            token_type: oauthParams.OAUTH_TOKEN_TYPE,
            expires_in: tokens.accessTokenExpireIn,
            refresh_token: tokens.refreshToken,
          } as IToken);
        }
      } else {
        throw {
          status: HttpStatus.BadRequest,
          data: {
            error: "invalid_grant",
            error_description: `The authorization code is not valid.`,
          } as IOauthError,
        };
      }
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json(error.data);
      } else {
        console.log(error);
        return res.status(HttpStatus.BadRequest).json({
          error: "server_error",
          error_description:
            "The authorization server encountered an unexpected condition that prevented it from fulfilling the request.",
        } as IOauthError);
      }
    }
  }
}

export default TokenGrantAuthorizationCodeHelper;
