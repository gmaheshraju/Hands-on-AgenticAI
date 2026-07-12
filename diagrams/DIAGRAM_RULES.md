---
inclusion: manual
---

# Architecture Diagram Generation Rules

When asked to create AWS architecture diagrams, follow these rules to produce clean results on the first attempt.

## Tool Selection

| Diagram Type | Use |
|---|---|
| AWS/cloud architecture (standard layouts) | `diagrams-mcp` — code-based, 500+ icons, auto-layout, version-controlled |
| Pixel-perfect placement / presentation-grade | Draw.io XML — full coordinate control, GUI-editable |
| Quick sketches for design discussions | Mermaid or Excalidraw |

**Default to diagrams-mcp** for architecture diagrams — faster to iterate, icons built-in, output is code.
**Switch to Draw.io XML** when exact visual placement matters or the diagram needs hand-editing later.

## Draw.io XML Rules

### Layout Strategy
1. **Main data flow goes LEFT → RIGHT.** Never vertical unless it's a fan-out/fan-in point.
2. **Separate horizontal lanes for concerns:**
   - Top lane: Entry points, API/Integration
   - Middle lane: Processing/compute (main flow)
   - Bottom lane: Orchestration details (if needed)
   - Right column: Supporting services (monitoring, config, storage)
3. **Entry points (external systems, users) always on the LEFT edge**
4. **Output/consumers always on the RIGHT edge**
5. **Supporting services (CloudWatch, RDS, SNS, Secrets Manager) stacked vertically in a RIGHT COLUMN** — connected with light dashed lines, not prominent
6. **Generous spacing:** 150px horizontal gap between icons, 120px vertical gap between lanes
7. **Icons are 40x40 with labels BELOW (not inside)**
8. **Annotation/context boxes in corners or margins** — never in the flow path
9. **Fan-out/fan-in is the ONLY time flow goes vertical** (e.g., curated S3 fans down to parallel QC jobs, QC jobs fan back to Decision Engine)

### Coordinate Grid Template (Starting Points)

Use these coordinates as a baseline. Adjust based on the number of components, but always maintain the spacing ratios.

**3-lane layout (most common):**
```
Lane 1 (Entry/API):        y = 80
Lane 2 (Processing/Core):  y = 220
Lane 3 (Data/Storage):     y = 360

Column 1 (Entry):          x = 100
Column 2 (Ingestion):      x = 280
Column 3 (Processing):     x = 460
Column 4 (Core logic):     x = 640
Column 5 (Output/Store):   x = 820
Column 6 (Consumers):      x = 1000

Supporting services column: x = 1200
  - Stacked at y = 80, 200, 320, 440
```

**4-lane layout (complex architectures):**
```
Lane 1 (CDN/Edge):         y = 60
Lane 2 (API/Ingestion):    y = 200
Lane 3 (Processing):       y = 340
Lane 4 (Data/Storage):     y = 480

Same column x values as above.
```

**Zone/boundary padding:** 30px inside from the outermost icon in each direction.

**Example — 3-tier web app coordinates:**
```
Users          → (100, 220)   [Lane 2, Col 1]
CloudFront     → (280, 80)    [Lane 1, Col 2]
ALB            → (280, 220)   [Lane 2, Col 2]
ECS/Lambda     → (460, 220)   [Lane 2, Col 3]
ElastiCache    → (460, 80)    [Lane 1, Col 3]
RDS Primary    → (640, 220)   [Lane 2, Col 4]
RDS Replica    → (640, 360)   [Lane 3, Col 4]
S3             → (820, 80)    [Lane 1, Col 5]
CloudWatch     → (1200, 80)   [Supporting, slot 1]
SNS            → (1200, 200)  [Supporting, slot 2]
```

### Boundary/Zone Rules
- Use **dashed outlines with no fill or very light fill** — NOT heavy colored backgrounds
- Keep boundaries subtle — the icons and arrows should be the visual focus, not the boxes
- Label boundaries in the top-left corner of the boundary, small font
- Example: `rounded=1;dashed=1;dashPattern=8 4;fillColor=none;strokeColor=#999999;verticalAlign=top;fontSize=9;`
- Only use colored fills for the outermost AWS account boundary

### Edge Rules (CRITICAL)
- **ALWAYS use `edgeStyle=orthogonalEdgeStyle`** — never omit this
- **NEVER use diagonal/slanted lines** — orthogonal routing gives clean right-angle arrows
- **Do NOT specify exitX/exitY/entryX/entryY** unless absolutely necessary — let orthogonal routing handle it
- Standard edge style: `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;`
- For bidirectional: add `startArrow=classic;endArrow=classic;startFill=1;endFill=1;`
- For dashed (external/async): add `dashed=1;`
- Edge labels: `fontSize=8;` keep them short

### Label Rules
- **Use `&#xa;` for line breaks** in node labels (NOT `<br>`)
- Keep labels to 2 lines max
- Font size 9 for node labels, 8 for edge labels
- Zone/cluster titles: fontSize=12, fontStyle=1

### Zone/Cluster Styling
- **Outermost AWS boundary:** light yellow fill: `fillColor=#FFF8E1;strokeColor=#F9A825;rounded=1;`
- **Internal logical groups:** dashed outlines, NO fill: `fillColor=none;strokeColor=#999999;dashed=1;dashPattern=8 4;rounded=1;`
- **Processing chain highlight (e.g., Step Functions, Parallel QC):** light dashed color outline: `fillColor=none;strokeColor=#1565C0;dashed=1;dashPattern=8 4;`
- **External systems:** grey outline: `fillColor=#F5F5F5;strokeColor=#9E9E9E;rounded=1;`
- Salesforce: `fillColor=#DAE8FC;strokeColor=#6C8EBF;rounded=1;`
- **NEVER use heavy colored fills for internal zones** — they compete with the icons visually

### VPC Boundary (Always Include for AWS Architectures)
When the architecture includes Lambda, RDS, or any compute that talks to a database:
- **Always draw a VPC boundary** inside the AWS zone
- Style: `rounded=1;fillColor=none;strokeColor=#2E7D32;dashed=1;dashPattern=8 4;verticalAlign=top;fontStyle=1;fontSize=10;fontColor=#2E7D32;`
- Label: "VPC (Private Subnets)" or "VPC – us-east-1"
- Place API Gateway INSIDE the VPC boundary (it accesses via VPC Link in private integrations)
- Place Lambda, RDS, RDS Proxy, Secrets Manager, VPC Endpoints inside
- Place S3, Glue, CloudWatch OUTSIDE VPC boundary but inside AWS zone (they're regional services accessed via VPC endpoints)
- Include VPC Endpoints when Lambda/Glue access S3 or Secrets Manager from within VPC

### AWS Icon Shapes — Two Shape Types
draw.io has TWO base shapes for AWS icons. Using the wrong one causes blank icons:

**`resourceIcon` + `resIcon`** — for compute/storage/database resource instances:

Compute & Application:
- Lambda: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;fillColor=#ED7100;`
- API Gateway: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.api_gateway;fillColor=#E7157B;`
- ECS: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ecs;fillColor=#ED7100;`
- EKS: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.eks;fillColor=#ED7100;`
- EC2: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;fillColor=#ED7100;`
- Step Functions: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.step_functions;fillColor=#E7157B;`

Storage:
- S3: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3;fillColor=#3F8624;`

Database:
- RDS: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.rds;fillColor=#C925D1;`
- DynamoDB: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.dynamodb;fillColor=#C925D1;`
- ElastiCache: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.elasticache;fillColor=#C925D1;`

Messaging & Streaming:
- SNS: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sns;fillColor=#E7157B;`
- SQS: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sqs;fillColor=#E7157B;`
- Kinesis: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.kinesis;fillColor=#8C4FFF;`
- EventBridge: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.eventbridge;fillColor=#E7157B;`

Networking & Content Delivery:
- CloudFront: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudfront;fillColor=#8C4FFF;`
- Route 53: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.route_53;fillColor=#8C4FFF;`
- ELB / ALB: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.elastic_load_balancing;fillColor=#8C4FFF;`

Analytics & ETL:
- Glue: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.glue;fillColor=#8C4FFF;`
- Elasticsearch/OpenSearch: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.elasticsearch_service;fillColor=#8C4FFF;`

Monitoring:
- CloudWatch: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudwatch;fillColor=#E7157B;`

**`productIcon` + `prIcon`** — for service-level/product icons:
- Secrets Manager: `shape=mxgraph.aws4.productIcon;prIcon=mxgraph.aws4.secrets_manager;fillColor=#DD344C;`
- Systems Manager: `shape=mxgraph.aws4.productIcon;prIcon=mxgraph.aws4.systems_manager;fillColor=#E7157B;`
- WAF: `shape=mxgraph.aws4.productIcon;prIcon=mxgraph.aws4.waf;fillColor=#DD344C;`
- VPC: `shape=mxgraph.aws4.productIcon;prIcon=mxgraph.aws4.vpc;fillColor=#8C4FFF;`
- RDS Proxy: `shape=mxgraph.aws4.productIcon;prIcon=mxgraph.aws4.rds;fillColor=#C925D1;`
- Cognito: `shape=mxgraph.aws4.productIcon;prIcon=mxgraph.aws4.cognito;fillColor=#DD344C;`
- IAM: `shape=mxgraph.aws4.productIcon;prIcon=mxgraph.aws4.iam;fillColor=#DD344C;`

**Standalone shapes** (no resourceIcon/productIcon wrapper):
- Users: `shape=mxgraph.aws4.users;`
- Client: `shape=mxgraph.aws4.client;`
- Mobile Client: `shape=mxgraph.aws4.mobile_client;`

Common base properties for ALL AWS icons:
`outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=9;aspect=fixed;`
- Icon size: 40x40

### Blank Icon Fix
If an icon renders blank in draw.io VS Code extension, use a **styled rectangle fallback**:
```
rounded=1;whiteSpace=wrap;html=1;fillColor=#FCE4EC;strokeColor=#<service-color>;fontSize=9;fontStyle=1;verticalAlign=middle;align=center;fontColor=#232F3E;
```

**Icons confirmed working with `resourceIcon`/`resIcon` in VS Code extension:**
- Lambda, API Gateway, S3, RDS, Glue, CloudWatch, SNS, SQS, DynamoDB, ECS, EC2, CloudFront, Route 53, ELB, Kinesis, ElastiCache, Step Functions, Elasticsearch/OpenSearch, EventBridge, EKS

**Icons that DO NOT render in VS Code extension (use colored rectangles):**
- Secrets Manager, Systems Manager/SSM, WAF, VPC Endpoints, RDS Proxy, Transfer Family, Cognito, IAM

Color guide for fallback rectangles:
- Security services (Secrets Manager, WAF, Cognito, IAM): `strokeColor=#DD344C;fillColor=#FCE4EC;`
- Management services (SSM, CloudWatch): `strokeColor=#E7157B;fillColor=#FCE4EC;`
- Database services (RDS Proxy): `strokeColor=#C925D1;fillColor=#F3E5F5;`
- Networking services (VPC Endpoints): `strokeColor=#8C4FFF;fillColor=#EDE7F6;`

**Rule: If an icon fails to render after one attempt, immediately use a rectangle fallback. Don't iterate on stencil names.**

### Non-AWS Components
- Use simple rounded rectangles: `rounded=1;whiteSpace=wrap;html=1;fontSize=9;verticalAlign=middle;align=center;`
- White fill for items inside zones: `fillColor=#FFFFFF;strokeColor=#666666;`
- Colored fill for special items (CDN, Auth): use light pastel + matching border

### Page Setup
```
pageWidth="1600" pageHeight="1000"
```

### Output Location
Default: `interview-prep-app/diagrams/` (Draw.io XML files and exported PNGs/SVGs go here)

## Prompt Template for User

When asking for a diagram, provide:
1. **Components** — list all nodes with their type
2. **Zones** — which components group together
3. **Connections** — what connects to what, with direction
4. **Layout preference** — left-to-right tiers or top-to-bottom tiers
5. **Reference image** — attach an existing diagram if recreating

## diagrams-mcp (Python diagrams library)

Built on mingrammer/diagrams — a full architecture-as-code tool, NOT just Graphviz.

**Capabilities:**
- 500+ node types across AWS, GCP, Azure, K8s, On-Prem, SaaS
- Nested clusters for VPCs, AZs, subnets, logical groups
- Multi-provider diagrams (AWS + on-prem in one diagram)
- Custom icons from URLs or local files
- Flowcharts with 24 shape types
- Automatic layout with proper edge routing
- Exports PNG and SVG

**When to use diagrams-mcp:**
- Fast iteration — code-based diagrams regenerate instantly on change
- Standardized AWS architectures — icons are built-in, no stencil lookup
- Version-controlled diagrams — diagram source is code, lives in git
- Multi-cloud / hybrid architectures — mix providers in one diagram

**When to use Draw.io XML instead:**
- Pixel-perfect placement matters (e.g., exact lane alignment for presentations)
- Need to hand-edit the diagram later in a GUI
- Complex annotation/callout positioning that auto-layout can't handle

**Use both together:** diagrams-mcp for rapid prototyping and the canonical source, Draw.io XML when the diagram needs precise visual polish for a specific audience.
