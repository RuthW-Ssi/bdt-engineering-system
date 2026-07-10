/**
 * This file has been claimed for ownership from @keycloakify/login-ui version 250004.7.2.
 * To relinquish ownership and restore this file to its original content, run the following command:
 * 
 * $ npx keycloakify own --path "login/components/Template/Template.tsx" --revert
 */

import type { ReactNode } from "react";
import { useEffect } from "react";
import { clsx } from "@keycloakify/login-ui/tools/clsx";
import { kcSanitize } from "@keycloakify/login-ui/kcSanitize";
import { useSetClassName } from "@keycloakify/login-ui/tools/useSetClassName";
import { useInitializeTemplate } from "./useInitializeTemplate";
import { useKcClsx } from "@keycloakify/login-ui/useKcClsx";
import { useI18n } from "../../i18n";
import { useKcContext } from "../../KcContext";
import mascotWai from "../../../assets/mascot-wai.svg";

export function Template(props: {
    displayInfo?: boolean;
    displayMessage?: boolean;
    displayRequiredFields?: boolean;
    headerNode: ReactNode;
    socialProvidersNode?: ReactNode;
    infoNode?: ReactNode;
    documentTitle?: string;
    bodyClassName?: string;
    children: ReactNode;
}) {
    const {
        displayMessage = true,
        socialProvidersNode = null,
        documentTitle,
        bodyClassName,
        children
    } = props;

    const { kcContext } = useKcContext();

    const { msg, msgStr } = useI18n();

    const { kcClsx } = useKcClsx();

    useEffect(() => {
        document.title =
            documentTitle ?? msgStr("loginTitle", kcContext.realm.displayName || kcContext.realm.name);
    }, []);

    useSetClassName({
        qualifiedName: "html",
        className: kcClsx("kcHtmlClass")
    });

    useSetClassName({
        qualifiedName: "body",
        className: bodyClassName ?? kcClsx("kcBodyClass")
    });

    const { isReadyToRender } = useInitializeTemplate();

    if (!isReadyToRender) {
        return null;
    }

    return (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-ssi-50 font-sans p-6">
            <div className="absolute -top-[56rem] left-[70%] -translate-x-1/2 w-[112rem] h-[112rem] rounded-full bg-ssi-100" />
            <div className="absolute -top-[23rem] left-[70%] -translate-x-1/2 w-[34rem] h-[34rem] rounded-full bg-ssi-800" />
            <div className="absolute -top-[41rem] left-[70%] -translate-x-1/2 w-[82rem] h-[82rem] rounded-full bg-ssi-200" />
            <div className="absolute -top-[22rem] left-[70%] -translate-x-1/2 w-[44rem] h-[44rem] rounded-full bg-ssi-400" />
            <div className="relative w-full max-w-md bg-white rounded-lg border border-ssi-400 shadow-[0_8px_24px_rgba(200,32,42,0.25)] p-8">
                <div className="flex flex-col items-center text-center mb-6">
                    <img src={mascotWai} alt="" className="w-36 h-36" />
                    <p className="text-lg font-semibold text-chrome-800 mt-2">BDT Engineering System</p>
                </div>
                <div>
                    <div id="kc-content">
                        <div id="kc-content-wrapper">
                                {/* App-initiated actions should not see warning messages about the need to complete the action during login. */}
                                {displayMessage &&
                                    kcContext.message !== undefined &&
                                    (kcContext.message.type !== "warning" ||
                                        !kcContext.isAppInitiatedAction) && (
                                        <div
                                            className={clsx(
                                                `alert-${kcContext.message.type}`,
                                                kcClsx("kcAlertClass"),
                                                `pf-m-${kcContext.message?.type === "error" ? "danger" : kcContext.message.type}`
                                            )}
                                        >
                                            <div className="pf-c-alert__icon">
                                                {kcContext.message.type === "success" && (
                                                    <span className={kcClsx("kcFeedbackSuccessIcon")}></span>
                                                )}
                                                {kcContext.message.type === "warning" && (
                                                    <span className={kcClsx("kcFeedbackWarningIcon")}></span>
                                                )}
                                                {kcContext.message.type === "error" && (
                                                    <span className={kcClsx("kcFeedbackErrorIcon")}></span>
                                                )}
                                                {kcContext.message.type === "info" && (
                                                    <span className={kcClsx("kcFeedbackInfoIcon")}></span>
                                                )}
                                            </div>
                                            <span
                                                className={kcClsx("kcAlertTitleClass")}
                                                dangerouslySetInnerHTML={{
                                                    __html: kcSanitize(kcContext.message.summary)
                                                }}
                                            />
                                        </div>
                                    )}
                                {children}
                                {socialProvidersNode}
                                {kcContext.auth !== undefined && kcContext.auth.showTryAnotherWayLink && (
                                    <form
                                        id="kc-select-try-another-way-form"
                                        action={kcContext.url.loginAction}
                                        method="post"
                                    >
                                        <div className={kcClsx("kcFormGroupClass")}>
                                            <input type="hidden" name="tryAnotherWay" value="on" />
                                            <a
                                                href="#"
                                                id="try-another-way"
                                                onClick={event => {
                                                    event.preventDefault();
                                                    document.forms[
                                                        "kc-select-try-another-way-form" as never
                                                    ].requestSubmit();

                                                    return false;
                                                }}
                                            >
                                                {msg("doTryAnotherWay")}
                                            </a>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
    );
}
