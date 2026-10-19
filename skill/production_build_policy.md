# AGENT BUILD & CODING POLICY: THE 111 PRODUCTION PROTOCOLS

> **POLICY SCOPE**: This document is an active, machine-enforceable instruction set. Any AI coding assistant, autonomous agent, or developer contributing to this repository must follow these rules without exception. "Vibe coding" without operational resilience is strictly rejected by CI and code review.

---

## 1. INGRESS, GATEWAYS & TRAFFIC MANAGEMENT

1. **Rate Limiting**: Enforce sliding-window or token-bucket rate limits at the gateway layer per caller IP and authenticated user ID. Reject excessive traffic with `429 Too Many Requests` containing standard `Retry-After` headers.
2. **Caching**: Place frequently accessed read paths behind cache layers (e.g., Redis). Every cache entry MUST specify an explicit TTL; unbounded caching is prohibited.
3. **Load Balancing**: Distribute traffic across stateless backend instances using algorithms such as Round Robin or Least Connections. Never route traffic to instances that fail active health checks.
4. **Reverse Proxies**: Place all application runtimes behind a hardened reverse proxy (e.g., NGINX, Envoy, Traefik). The reverse proxy must handle TLS termination, request buffering, and internal network masking.
5. **API Gateways**: Enforce centralized cross-cutting concerns—authentication, global rate limiting, path routing, and metrics collection—at the API Gateway rather than duplicating them in internal handlers.

---

## 2. CI/CD & CONTAINER ORCHESTRATION

6. **CI/CD Pipelines**: Block all direct commits to production branches. Every change requires passing an automated pipeline executing linting, security scans, unit tests, and integration test suites.
7. **Docker Containers**: Generate minimal, multi-stage, rootless Docker images. Base images must use pinned semantic tags; the `:latest` tag is banned in production images.
8. **Kubernetes (K8s)**: Define explicit `resources.requests` and `resources.limits` for both CPU and Memory on every container spec. Every workload must include a Pod Disruption Budget (PDB) and Horizontal Pod Autoscaler (HPA).
9. **Service Discovery**: Microservices must locate peer services using dynamic internal DNS or service mesh registries (e.g., CoreDNS, Consul). Hardcoding internal IP addresses or port mappings in code is forbidden.

---

## 3. RESILIENCE, NETWORKING & ASYNCHRONOUS OPERATIONS

10. **Circuit Breakers**: Wrap external network and third-party dependencies in circuit breakers. If error rates exceed 50% over a 10-second window, trip the breaker to fail fast and prevent thread pool exhaustion.
11. **Timeouts**: Define explicit socket connect and read timeouts on every outbound HTTP client, RPC stub, and database driver. Zero or infinite timeout defaults are strictly banned.
12. **Retries**: Restrict automated retries strictly to idempotent mutations or idempotent reads failing with transient codes (`502`, `503`, `504`, network drop). Never retry client-side errors (`400`, `401`, `403`, `422`).
13. **Exponential Backoff**: Implement exponential backoff ($2^n \times \text{base}$) accompanied by full randomized jitter on all retry logic to eliminate thundering herd synchronization.
14. **Idempotency**: Require an `Idempotency-Key` HTTP header for all non-safe state-mutating requests (e.g., payments, resource creation). Cache and replay responses for duplicate requests within a 24-hour window.
15. **Message Queues**: Offload any operation that takes longer than 200ms or involves external I/O (e.g., email dispatch, PDF generation) to durable background queues (RabbitMQ, SQS, BullMQ).
16. **Pub/Sub Systems**: Publish decoupled state changes to broadcast topics (e.g., Kafka, AWS SNS, Google Cloud Pub/Sub) using standardized schemas to avoid synchronous multi-service call chains.
17. **Event-Driven Architecture**: Design domain systems around immutable events representing state transitions. Downstream state mutations must be event-driven rather than tightly coupled to synchronous REST invocations.
18. **Distributed Transactions**: Avoid synchronous distributed two-phase commit ($2PC$) protocols across microservice boundaries. Implement eventual consistency models backed by compensating logic.
19. **Saga Pattern**: Coordinate multi-step business transactions across distinct services using the Saga Pattern (orchestrated or choreographed) with verified, automated compensation handlers for every step.
20. **Dead Letter Queues (DLQ)**: Attach a DLQ to every asynchronous consumer. After an unrecoverable failure or maximum retry exhaustion, dead-letter the poison-pill message and trigger an alert.

---

## 4. REAL-TIME COMMUNICATION & TASK SCHEDULING

21. **Cron Jobs**: Run recurring tasks through scheduled workers backed by distributed locks to guarantee single execution across clustered environments. All cron jobs must be idempotent.
22. **WebSockets**: Utilize WebSockets for real-time bi-directional messaging only. Maintain explicit heartbeat frames (`ping`/`pong`), drop unresponsive connections, and design clients for automatic reconnection.
23. **Long Polling**: Reserve long polling strictly for environments where persistent WebSocket connections are blocked by legacy infrastructure. Implement strict client timeouts to avoid holding connection slots indefinitely.
24. **Server-Sent Events (SSE)**: Prefer SSE over WebSockets for one-directional server-to-client event streaming (e.g., LLM generation streams, metrics updates) to benefit from standard HTTP/2 multiplexing.

---

## 5. DATABASE ARCHITECTURE, CONCURRENCY & INTEGRITY

25. **Database Indexing**: Apply B-tree or appropriate indexes on all foreign keys, columns referenced in `WHERE` clauses, and composite sort keys. Regularly identify and drop unused indexes to reduce write latency.
26. **Query Optimization**: Profile slow queries using `EXPLAIN ANALYZE`. Table scans on large tables ($>10,000$ rows) and unindexed join conditions are strictly blocked from release.
27. **N+1 Queries**: Eliminate N+1 ORM query anti-patterns. Use eager loading, join fetches, or batch query loaders to fetch relational data within a constant number of roundtrips ($O(1)$).
28. **Connection Pooling**: Configure managed connection pools (e.g., PgBouncer, HikariCP) between applications and datastores. Max pool size must be explicitly sized based on database hardware limits.
29. **Read Replicas**: Direct analytical queries, batch reports, and heavy read workloads to read replicas. Preserve the primary instance strictly for writes and consistency-critical reads.
30. **Database Sharding**: Partition high-volume datastores horizontally using a high-cardinality shard key to balance read/write operations and disk usage evenly across cluster nodes.
31. **Table Partitioning**: Partition massive tables by ranges (e.g., `timestamp` range partitioning by month) to accelerate lookups and enable zero-downtime maintenance operations.
32. **Replication**: Maintain automated data replication across independent Availability Zones (AZs) with real-time alerting on replication lag exceeding acceptable thresholds.
33. **Leader Election**: Manage single-writer state machines using battle-tested consensus protocols (Raft, Paxos via etcd/ZooKeeper) to prevent split-brain dual-primary corruption.
34. **CAP Theorem**: Explicitly declare architectural trade-offs: when network partitions occur, document whether the component prioritizes Consistency ($CP$) or Availability ($AP$).
35. **Eventual Consistency**: Ensure clients querying asynchronously replicated stores handle eventual consistency gracefully without producing invalid intermediate state updates.
36. **Optimistic Locking**: Handle high-throughput, low-contention updates using version numbers (`version_id`). If the version number changed during processing, reject the update and retry cleanly.
37. **Pessimistic Locking**: Reserve pessimistic record locking (`SELECT FOR UPDATE`) for high-contention, financial-grade mutations. Never hold database locks across external network requests.
38. **Distributed Locks**: Acquire locks over distributed resources using reliable distributed key-value engines (e.g., Redis via Redlock) with mandatory TTL safety expirations.
39. **Race Conditions**: Protect all shared in-memory and persisted resources using atomic operations, mutexes, or transactional isolation levels.
40. **Deadlocks**: Acquire locks across multiple entities in a consistent, globally deterministic order. Configure short transaction lock-wait timeouts.
41. **Memory Leaks**: Profile application heaps continuously. Explicitly unbind event listeners, clean up subscriptions, release stream handles, and prevent global variable retention.

---

## 6. RUNTIMES, MEMORY & SCALING STRATEGIES

42. **Garbage Collection (GC)**: Tune GC algorithms and heap allocations in memory-managed runtimes to keep "stop-the-world" pauses well below customer latency budgets.
43. **Thread Safety**: Avoid mutable shared state across threads. Rely on thread-safe data structures, immutability, or worker isolation models to avoid data corruption.
44. **Backpressure**: When downstream consumers cannot keep pace with ingest rates, throttle, buffer, or reject producers early to protect the process from out-of-memory crashes.
45. **Autoscaling**: Automate cluster and instance scaling based on target metrics (CPU, memory, custom queue depths) with calibrated cooldown periods to avoid scaling churn.
46. **Horizontal Scaling**: Build application compute layers entirely stateless. Externalize session data to distributed stores to allow arbitrary replication of backend containers.
47. **Vertical Scaling**: Use vertical scaling only for transient overhead spikes or specialized database nodes; plan horizontal scaling for horizontal application tiers.
48. **Content Delivery Network (CDN)**: Serve all static assets, media files, and cacheable public endpoints through an edge CDN (e.g., Cloudflare, CloudFront) with strict caching headers.
49. **Edge Caching**: Cache common read-heavy responses and execute lightweight computation at points of presence (PoPs) closest to the user.
50. **Cache Invalidation**: Implement deterministic cache invalidation hooks. When primary records mutate, immediately invalidate or overwrite corresponding cached keys.

---

## 7. DEPLOYMENTS, PROBES & RELEASES

51. **Feature Flags**: Wrap new user-facing functionality and major architectural shifts in dynamic feature flags to allow instant runtime toggling without code re-deployment.
52. **Blue-Green Deployments**: Maintain two identical production environments. Direct live traffic to the green environment only after comprehensive automated smoke tests succeed.
53. **Canary Releases**: Release updates to a small subset of live users (e.g., 1–5%) first. Verify error rates and performance metrics before expanding rollout to 100%.
54. **Rolling Deployments**: Update instances progressively in rolling steps, ensuring that the number of active, healthy instances never drops below the minimum capacity requirement.
55. **Rollbacks**: Automate one-click rollback procedures in the deployment pipeline. Any critical regression in production must trigger an automated rollback rather than an unverified hotfix.
56. **Health Checks**: Expose a `/healthz` or `/status` endpoint returning accurate HTTP status codes based on application vitality and internal readiness.
57. **Liveness & Readiness Probes**: Separate health verification into Liveness probes (restarting crashed or deadlocked containers) and Readiness probes (temporarily pulling unready containers out of the load balancer rotation).

---

## 8. OBSERVABILITY, TELEMETRY & RELIABILITY METRICS

58. **System Monitoring**: Collect telemetry on system resources (CPU, Memory, Disk I/O, Network saturation) across all production hosts and containers.
59. **Structured Logging**: Write all application logs in structured JSON format containing a timestamp, log level, message, and correlation context. Do not write raw, unparsed strings to disk.
60. **Distributed Tracing**: Inject and propagate OpenTelemetry trace and span headers across every network boundary to visualize end-to-end distributed latency waterfalls.
61. **Metrics Collection**: Emit application-level metrics—counters, gauges, and latency histograms—and scrape them with tools like Prometheus.
62. **Alerting**: Alert on actionable symptoms that affect users (e.g., high 5xx rates, breach of latency thresholds), not on benign, self-healing warnings.
63. **Service Level Objectives (SLOs)**: Define precise SLO targets (e.g., 99.9% of requests complete with `200 OK` in under 300ms) agreed upon by engineering and product teams.
64. **Service Level Indicators (SLIs)**: Measure real-time SLIs directly against incoming traffic telemetry to assess compliance with defined SLOs.
65. **Error Budgets**: Calculate remaining error budgets ($100\% - \text{SLO}$). When an error budget is depleted, halt new feature deployments and allocate capacity entirely to reliability engineering.
66. **Observability**: Combine metrics, traces, and structured logs into a unified platform to enable rapid diagnosis of unknown-unknown failure modes.

---

## 9. SECURITY, ACCESS CONTROL & VULNERABILITY PREVENTION

67. **Secrets Management**: Never commit credentials, tokens, or private keys to source control. Inject secrets at runtime using encrypted secret managers (e.g., HashiCorp Vault, AWS Secrets Manager).
68. **IAM (Identity & Access Management)**: Enforce the Principle of Least Privilege. Restrict human and machine roles to the minimum set of permissions necessary to execute their function.
69. **OAuth**: Use OAuth 2.0 and OpenID Connect (OIDC) standards for authentication and delegated authorization. Never design proprietary, non-standard auth flows.
70. **JWT Rotation**: Keep JSON Web Token lifetimes brief (e.g., 15 minutes). Rotate cryptographic signing keys dynamically via standard JWKS endpoints.
71. **TLS Enforcement**: Enforce TLS 1.3 across all public and internal communications. Plaintext HTTP traffic must be rejected or redirected to HTTPS.
72. **Encryption at Rest**: Encrypt all persistent volumes, databases, and object stores using AES-256 or cloud KMS-managed encryption keys.
73. **Encryption in Transit**: Encrypt all traffic traversing the network using TLS or mutual TLS (mTLS) for zero-trust microservice meshes.
74. **Web Application Firewall (WAF)**: Place a WAF at the ingress boundary to filter out malicious payloads, known CVE exploit attempts, and bad bot scrapers.
75. **DDoS Protection**: Shield public-facing DNS and HTTP ingress with volumetric DDoS mitigation layers (e.g., Cloudflare, AWS Shield).
76. **CORS Policy**: Configure explicit `Access-Control-Allow-Origin` domains. Wildcard origin headers (`*`) combined with credentials (`Access-Control-Allow-Credentials: true`) are strictly forbidden.
77. **CSRF Protection**: Guard state-changing cookie-based requests with anti-CSRF tokens and ensure all session cookies enforce `SameSite=Lax` or `SameSite=Strict`.
78. **SQL Injection**: Write database queries exclusively using parameterized inputs, prepared statements, or hardened ORM query interfaces. String interpolation in raw SQL is banned.
79. **Cross-Site Scripting (XSS)**: Sanitize, encode, and escape all user-generated content before rendering it in the UI. Enforce a restrictive Content Security Policy (CSP).
80. **Server-Side Request Forgery (SSRF)**: Validate and restrict server-initiated outgoing requests. Block server requests to internal addresses, loopbacks (`127.0.0.1`), and cloud metadata IP ranges (`169.254.169.254`).

---

## 10. DATABASE LIFECYCLE & DISASTER RECOVERY

81. **Database Migrations**: Manage all database schema changes through versioned migration scripts committed to source control. Avoid breaking modifications by following expand-and-contract patterns.
82. **Schema Versioning**: Track active migration states through a migration history table. CI/CD must verify migration compatibility against production-like schemas before deployment.
83. **Disaster Recovery (DR)**: Maintain a documented Disaster Recovery plan with clearly specified Recovery Time Objectives (RTO) and Recovery Point Objectives (RPO).
84. **Backups**: Run automated daily snapshots and preserve point-in-time recovery (PITR) transaction logs. Test database restoration procedures monthly.
85. **Failover**: Configure automated failover to hot standby database instances to ensure uninterrupted uptime during hardware crashes.
86. **Multi-Region Deployments**: For mission-critical workloads, distribute application compute and storage across distinct cloud regions to withstand total region-wide outages.

---

## 11. PERFORMANCE PROFILING & CAPACITY MANAGEMENT

87. **Chaos Engineering**: Schedule controlled fault-injection experiments (e.g., killing container nodes, injecting network latency) in non-production or staging to uncover hidden systemic failures.
88. **Cost Optimization**: Continually audit cloud infrastructure. Delete unused resources, size instance tiers to real traffic profiles, and reserve long-term capacity to avoid on-demand waste.
89. **Cold Starts**: Minimize serverless cold starts by reducing runtime artifact sizes, avoiding heavy import chains, or configuring provisioned concurrency for latency-sensitive routes.
90. **Serverless Limits**: Respect vendor serverless constraints (e.g., execution timeouts, max payload sizes). Route heavy processing to background workers rather than synchronous serverless handlers.
91. **Latency**: Monitor and minimize roundtrip latency across the stack. Benchmark server-processing overhead separately from database access and network transit.
92. **Throughput**: Load-test systems to establish maximum Requests Per Second (RPS) limits before release, verifying that resource utilization remains stable under peak load.
93. **P99 Latency**: Focus operational evaluations on 99th-percentile (P99) response times rather than averages, catching performance outliers affecting edge cases.
94. **Tail Latency**: Eliminate tail-latency causes by implementing hedging requests, shedding load under stress, and preventing GC stalls.

---

## 12. NETWORKING, PROTOCOLS & LOW-LEVEL PIPELINES

95. **Network Partitions**: Build systems to withstand network drops between nodes. Prefer safe degradation or read-only states over uncoordinated concurrent writes.
96. **Clock Skew**: Synchronize all servers using Network Time Protocol (NTP). Do not rely on local machine timestamps for distributed ordering; use Lamport timestamps, ULIDs, or database-generated sequences.
97. **DNS Configuration**: Configure sensible DNS Time-To-Live (TTL) values (e.g., 60 seconds on load balancers). Include fallback resolvers to survive upstream provider issues.
98. **TCP vs. UDP**: Use TCP when data delivery and byte ordering must be guaranteed; select UDP for loss-tolerant real-time multimedia feeds (voice, video, gaming).
99. **HTTP/2 & HTTP/3**: Enable HTTP/2 or HTTP/3 on reverse proxies to leverage header compression and stream multiplexing over single network connections.
100. **gRPC**: Utilize gRPC and Protocol Buffers for high-throughput, low-latency inter-service microservice communications, deprecating verbose internal JSON APIs.
101. **Webhooks**: Protect outbound webhooks with HMAC signatures; require incoming webhook handlers to verify signatures, execute idempotently, and return fast `200 OK` acknowledgments before async processing.

---

## 13. INFRASTRUCTURE AS CODE & OPERATIONAL EXCELLENCE

102. **API Versioning**: Prefix APIs with explicit version identifiers (e.g., `/api/v1`). Deprecate older versions gradually with advance communication; never make breaking changes to an active route.
103. **Semantic Versioning (SemVer)**: Tag libraries and modules following `MAJOR.MINOR.PATCH`. Increment `MAJOR` for breaking updates, `MINOR` for backward-compatible features, and `PATCH` for bug fixes.
104. **Infrastructure as Code (IaC)**: Provision all infrastructure—cloud networks, compute instances, security groups—via code managed in version control. Direct console adjustments are prohibited.
105. **Terraform**: Manage cloud infrastructure with Terraform. State files must be stored in remote encrypted backends with locking enabled; changes require approved plan outputs.
106. **Helm Charts**: Package Kubernetes manifests into modular Helm charts. Environment-specific parameters must live in decoupled `values.yaml` files.
107. **Build Caching**: Configure deterministic layer caching in CI/CD container builds to keep build times under 5 minutes and accelerate deployment velocity.
108. **Dependency Management**: Commit explicit lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`, `poetry.lock`). Scan dependencies continuously for known vulnerabilities.
109. **Production Incidents**: Triage production outages under a formal incident management process. Designate an Incident Commander and centralize communications in a dedicated war room.
110. **On-Call Engineering**: Maintain a regular, well-documented on-call rotation with clear escalation paths and step-by-step runbooks for every alert.
111. **Postmortems**: Complete a blameless postmortem within 48 hours of any production incident. Identify root causes, document timelines, and track remediation action items to completion.

---

### ENFORCEMENT CHECKLIST FOR CODING AGENTS

Before completing any task, the AI coding agent must verify:
- [ ] No unbounded queries or missing indexes.
- [ ] Timeouts and circuit breakers are present on all network calls.
- [ ] Mutating endpoints support idempotency.
- [ ] Error handling does not leak internal stack traces or secrets.
- [ ] Secrets and configs are loaded from environment variables/vaults.
- [ ] Structured logging and distributed trace headers are maintained.