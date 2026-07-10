import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { KcContextProvider } from "../../KcContext";
import { I18nProvider } from "../../i18n";
import { KcClsxProvider } from "@keycloakify/login-ui/useKcClsx";
import { getKcContextMock } from "../../mocks/getKcContextMock";
import { Page } from "./Page";

// @testing-library/react's auto-cleanup only registers itself when it finds a
// global `afterEach` (e.g. via Vitest's `test.globals: true`). This project's
// vitest.config.ts doesn't enable globals, so we register cleanup explicitly —
// otherwise each `renderLoginPage()` call below stacks another rendered tree
// into `document.body` and `getByRole`/`queryByLabelText` start throwing
// "found multiple elements" from the second test onward.
afterEach(cleanup);

function renderLoginPage(overrides: Record<string, unknown> = {}) {
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
            },
            ...overrides
        }
    });

    render(
        <KcContextProvider kcContext={kcContext}>
            <I18nProvider kcContext={kcContext}>
                {/*
                    Production (KcPage.tsx) always wraps pages in a KcClsxProvider
                    (see styleLevelCustomization.tsx -> doUseDefaultCss: true), which
                    Form.tsx/SocialProviders.tsx/Template.tsx rely on via useKcClsx().
                    We supply it here directly rather than composing the real
                    StyleLevelCustomization wrapper, and pin doUseDefaultCss to
                    false: with it true, Template's useInitializeTemplate() waits
                    on real <link rel="stylesheet"> "load" events for PatternFly
                    CSS, which never fire under jsdom (no network), so the page
                    would never leave isReadyToRender === false.
                */}
                <KcClsxProvider doUseDefaultCss={false} classes={undefined}>
                    <Page />
                </KcClsxProvider>
            </I18nProvider>
        </KcContextProvider>
    );
}

describe("Login page — Microsoft CTA + break-glass form", () => {
    it("renders a prominent Microsoft sign-in link", () => {
        renderLoginPage();
        expect(screen.getByRole("link", { name: /microsoft/i })).toBeInTheDocument();
    });

    it("does not show the username/password inputs by default", () => {
        renderLoginPage();
        // `selector: "input"` disambiguates from PasswordWrapper's "Show password"
        // visibility-toggle button, which also has an accessible name matching /password/i.
        expect(screen.queryByLabelText(/password/i, { selector: "input" })).not.toBeVisible();
    });

    it("reveals the username/password form when the break-glass toggle is opened", async () => {
        renderLoginPage();
        const toggle = screen.getByText(/ใช้บัญชี local/i);
        toggle.click();
        expect(await screen.findByLabelText(/password/i, { selector: "input" })).toBeVisible();
    });
});
