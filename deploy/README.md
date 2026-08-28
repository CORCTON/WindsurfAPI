# CORCTON production deployment

The Dokploy deployment intentionally uses the upstream release image without a
compatibility proxy or source patch. `DEVIN_CONNECT` is the headless native path;
the persisted `/data` volume remains the source of account and credential state.

For this single-user Condor installation, sticky account affinity and the explicit
single-tenant cache signal are enabled. The zero-billable liveness probe checks
account sessions in the background. Experimental wire tags, session reuse, custom
rate-limit values, and debug tracing stay at upstream defaults.

`/v1/models` is authoritative. Condor must fail fast if `glm-5-2` or
`swe-1-7-medium` is not present for the connected Devin account; never synthesize
catalog entries in another proxy. The container healthcheck verifies both model
IDs against the authenticated live catalog.
