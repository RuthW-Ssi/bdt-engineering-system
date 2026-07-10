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
                    loginUrl: "https://example.com/broker/Oidc_o365/login",
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
