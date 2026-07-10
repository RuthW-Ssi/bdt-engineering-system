/**
 * This file has been claimed for ownership from @keycloakify/login-ui version 250004.7.2.
 * To relinquish ownership and restore this file to its original content, run the following command:
 * 
 * $ npx keycloakify own --path "login/pages/login/SocialProviders.tsx" --revert
 */

import { kcSanitize } from "@keycloakify/login-ui/kcSanitize";
import { useKcContext } from "../../KcContext";
import { assert } from "tsafe/assert";

/** To use this component make sure that kcContext.social exists */
export function SocialProviders() {
    const { kcContext } = useKcContext();

    assert("social" in kcContext && kcContext.social !== undefined);

    if (kcContext.social.providers === undefined || kcContext.social.providers.length === 0) {
        return null;
    }

    return (
        <div id="kc-social-providers" className="mt-2">
            <ul className="flex flex-col gap-3">
                {kcContext.social.providers.map(p => (
                    <li key={p.alias}>
                        <a
                            id={`social-${p.alias}`}
                            href={p.loginUrl}
                            className="flex items-center justify-center gap-2 w-full py-3 rounded bg-ssi-600 text-white font-sans font-semibold hover:bg-ssi-800"
                        >
                            <span dangerouslySetInnerHTML={{ __html: kcSanitize(p.displayName) }} />
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
}
