import "./index.css";
import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { KcPage } from "./kc.gen";
import { getKcContextMock } from "./login/mocks/getKcContextMock";

const kcContext = getKcContextMock({
    pageId: "login.ftl",
    overrides: {
        realm: { password: true },
        social: {
            providers: [
                {
                    alias: "Oidc_o365",
                    displayName: "Microsoft",
                    // NOTE: this is a manual approximation for local dev preview only.
                    // In the real deployed theme, Keycloak generates this URL itself
                    // per-provider (already a direct broker link, no kc_idp_hint needed).
                    // This manual version may still hit a PKCE error since it's not going
                    // through keycloak-js — that part of the integration is separate,
                    // still-blocked work, not something this theme branch can fully test.
                    loginUrl: "https://dev-iam.ssi-steel.com/realms/ssi-realm-test/protocol/openid-connect/auth?client_id=auth-bdt-engineer-system&redirect_uri=http%3A%2F%2Flocalhost%3A5173%2F&response_type=code&scope=openid&kc_idp_hint=Oidc_o365",
                    iconClasses: ""
                }
            ]
        }
    }
});

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <KcPage kcContext={kcContext} />
    </StrictMode>
);
