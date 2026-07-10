/**
 * This file has been claimed for ownership from @keycloakify/login-ui version 250004.7.2.
 * To relinquish ownership and restore this file to its original content, run the following command:
 *
 * $ npx keycloakify own --path "login/pages/login/Form.tsx" --revert
 */

import { useState } from "react";
import { assert } from "tsafe/assert";
import { PasswordWrapper } from "../../components/PasswordWrapper";
import { useI18n } from "../../i18n";
import { useKcContext } from "../../KcContext";
import { kcSanitize } from "@keycloakify/login-ui/kcSanitize";
import { useScript } from "./useScript";

const inputClass =
    "w-full rounded-lg border border-ssi-400 px-3 py-2 text-chrome-800 focus:outline-none focus:ring-2 focus:ring-ssi-600 focus:border-ssi-600";
const labelClass = "block text-sm font-medium text-chrome-800 mb-1";
const errorClass = "block text-sm text-ssi-600 mt-1";

export function Form() {
    const { kcContext } = useKcContext();
    assert(kcContext.pageId === "login.ftl");

    const { msg, msgStr } = useI18n();

    const [isLoginButtonDisabled, setIsLoginButtonDisabled] = useState(false);

    const webAuthnButtonId = "authenticateWebAuthnButton";

    useScript({ webAuthnButtonId });

    return (
        <>
            <div id="kc-form">
                <div id="kc-form-wrapper">
                    {kcContext.realm.password && (
                        <div className="mt-4">
                            <form
                                id="kc-form-login"
                                className="mt-3"
                                onSubmit={() => {
                                    setIsLoginButtonDisabled(true);
                                    return true;
                                }}
                                action={kcContext.url.loginAction}
                                method="post"
                            >
                                {!kcContext.usernameHidden && (
                                    <div className="mb-4">
                                        <label htmlFor="username" className={labelClass}>
                                            {!kcContext.realm.loginWithEmailAllowed
                                                ? msg("username")
                                                : !kcContext.realm.registrationEmailAsUsername
                                                  ? msg("usernameOrEmail")
                                                  : msg("email")}
                                        </label>
                                        <input
                                            tabIndex={2}
                                            id="username"
                                            className={inputClass}
                                            name="username"
                                            defaultValue={kcContext.login.username ?? ""}
                                            type="text"
                                            autoFocus
                                            autoComplete={
                                                kcContext.enableWebAuthnConditionalUI
                                                    ? "username webauthn"
                                                    : "username"
                                            }
                                            aria-invalid={kcContext.messagesPerField.existsError(
                                                "username",
                                                "password"
                                            )}
                                        />
                                        {kcContext.messagesPerField.existsError("username", "password") && (
                                            <span
                                                id="input-error"
                                                className={errorClass}
                                                aria-live="polite"
                                                dangerouslySetInnerHTML={{
                                                    __html: kcSanitize(
                                                        kcContext.messagesPerField.getFirstError(
                                                            "username",
                                                            "password"
                                                        )
                                                    )
                                                }}
                                            />
                                        )}
                                    </div>
                                )}

                                <div className="mb-4">
                                    <label htmlFor="password" className={labelClass}>
                                        {msg("password")}
                                    </label>
                                    <PasswordWrapper passwordInputId="password">
                                        <input
                                            tabIndex={3}
                                            id="password"
                                            className={`${inputClass} pr-10`}
                                            name="password"
                                            type="password"
                                            autoComplete="current-password"
                                            aria-invalid={kcContext.messagesPerField.existsError(
                                                "username",
                                                "password"
                                            )}
                                        />
                                    </PasswordWrapper>
                                    {kcContext.usernameHidden &&
                                        kcContext.messagesPerField.existsError("username", "password") && (
                                            <span
                                                id="input-error"
                                                className={errorClass}
                                                aria-live="polite"
                                                dangerouslySetInnerHTML={{
                                                    __html: kcSanitize(
                                                        kcContext.messagesPerField.getFirstError(
                                                            "username",
                                                            "password"
                                                        )
                                                    )
                                                }}
                                            />
                                        )}
                                </div>

                                <div id="kc-form-buttons">
                                    <input
                                        type="hidden"
                                        id="id-hidden-input"
                                        name="credentialId"
                                        value={kcContext.auth.selectedCredential}
                                    />
                                    <input
                                        tabIndex={7}
                                        disabled={isLoginButtonDisabled}
                                        className="w-full py-3 rounded-lg bg-ssi-600 text-white font-sans font-semibold hover:bg-ssi-800 transition-all disabled:opacity-50"
                                        name="login"
                                        id="kc-login"
                                        type="submit"
                                        value={msgStr("doLogIn")}
                                    />
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </div>

            {kcContext.enableWebAuthnConditionalUI && (
                <>
                    <form id="webauth" action={kcContext.url.loginAction} method="post">
                        <input type="hidden" id="clientDataJSON" name="clientDataJSON" />
                        <input type="hidden" id="authenticatorData" name="authenticatorData" />
                        <input type="hidden" id="signature" name="signature" />
                        <input type="hidden" id="credentialId" name="credentialId" />
                        <input type="hidden" id="userHandle" name="userHandle" />
                        <input type="hidden" id="error" name="error" />
                    </form>
                    {kcContext.authenticators !== undefined &&
                        kcContext.authenticators.authenticators.length !== 0 && (
                            <>
                                <form id="authn_select">
                                    {kcContext.authenticators.authenticators.map((authenticator, i) => (
                                        <input
                                            key={i}
                                            type="hidden"
                                            name="authn_use_chk"
                                            readOnly
                                            value={authenticator.credentialId}
                                        />
                                    ))}
                                </form>
                            </>
                        )}
                    <br /> {/* We use a br here because kcMarginTopClass is not defined in login v1 */}
                    <input
                        id={webAuthnButtonId}
                        type="button"
                        className="w-full py-3 rounded-lg border-2 border-ssi-600 bg-white text-ssi-600 font-sans font-semibold hover:bg-ssi-600 hover:text-white transition-all"
                        value={msgStr("passkey-doAuthenticate")}
                    />
                </>
            )}
        </>
    );
}
