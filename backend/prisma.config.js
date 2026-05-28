"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = require("node:path");
const config_1 = require("prisma/config");
exports.default = (0, config_1.defineConfig)({
    earlyAccess: true,
    schema: node_path_1.default.join(__dirname, 'prisma/schema.prisma'),
    migrate: {
        async adapter() {
            const { PrismaPg } = await Promise.resolve().then(() => require('@prisma/adapter-pg'));
            const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
            if (!url)
                throw new Error('DATABASE_URL not set');
            return new PrismaPg({ connectionString: url });
        },
    },
});
//# sourceMappingURL=prisma.config.js.map