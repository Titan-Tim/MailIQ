-- Licensed modules per tenant. Existing tenants keep both modules.
ALTER TABLE "Tenant" ADD COLUMN "enabledModules" TEXT[] NOT NULL DEFAULT ARRAY['inbound', 'outbound']::TEXT[];
