<p align="right">
  <a href="../README.md">English</a> |
  <a href="./README.zh-CN.md">简体中文</a>
</p>

# BlockBenchMCP

> Unofficial hardened fork: build this branch from source. Upstream release bundles do not include the security patch. Autostart is off; start MCP explicitly. See [Security Model](../SECURITY.md) and [validation](VALIDATION.md).

面向 Minecraft 的 **[Model Context Protocol](https://modelcontextprotocol.io/)**，以 **纯 Blockbench 桌面插件** 形式运行（≥ 5.1.0）。

安装插件 → 插件在本机 `127.0.0.1` 拉起 HTTP MCP → Cursor / 其他客户端用 URL 连接。**不需要单独的 Node 适配器进程。**关 Blockbench = MCP 停用。

意图级工具（`scaffold_biped`、`check_model` 等），不是把 UI 原样甩给模型。

## 安装

**成品（推荐）：** 从 [GitHub Releases](https://github.com/SwagRee/BlockBenchMCP/releases) 下载 `blockbench_mcp.js`。

从源码构建：

```bash
git clone --branch hardening/security-v1 https://github.com/LuanJKB/BlockBenchMCP.git
cd BlockBenchMCP
npm install && npm run build
```

产物：`packages/plugin/dist/blockbench_mcp.js`。

1. Blockbench：**File → Plugins → Load Plugin from File**（下载文件或构建产物）
2. 首次若弹出 **network / net** 权限，选 Always allow
3. 默认监听：`http://127.0.0.1:39741/mcp`（也可 Tools → Start / Stop MCP Server）
4. 设置可改端口 / Bearer（随机生成，见 MCP Shared Secret）

## 连接 Cursor

```json
{
  "url": "http://127.0.0.1:39741/mcp",
  "headers": { "Authorization": "Bearer <YOUR_RANDOM_TOKEN>" }
}
```

先开 Blockbench（插件已加载），再启用 MCP，调用 `health`。

## 架构

```
AI 客户端  --HTTP MCP-->  packages/plugin（Blockbench 内）
```

| 包       | 职责                                         |
| -------- | -------------------------------------------- |
| `shared` | Zod、指南、工具契约、测试                    |
| `plugin` | 桌面插件；内嵌 HTTP MCP + Host 端口调 BB API |

安全：仅绑定 `127.0.0.1`；请求需 Bearer；文件导出前须 `propose_scoped_directory` 用户确认。

## 范围（v1）

| 格式                                 | 优先级 |
| ------------------------------------ | ------ |
| `java_block`                         | P0     |
| `geckolib_model`（需 GeckoLib 插件） | P0     |
| `bedrock` / `bedrock_old` 实体        | 已支持 |
| 通用自由建模 / 网格刷子              | 不做   |

**不做：** `trigger_action` / `emulate_clicks` / `risky_eval`、完整画笔 UI、Hytale 等。

## 主要工具

| 类别      | 工具                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 发现      | `health`、`list_formats`、`get_project_summary`、`get_elements`、`get_guide`                                                                                                                                                                                                                                                                                                                            |
| 检查      | `check_model`、`capture_views`、`analyze_view_silhouette`                                                                                                                                                                                                                                                                                                                                               |
| 项目      | `create_project`、`set_project_meta`                                                                                                                                                                                                                                                                                                                                                                    |
| 几何      | `scaffold_biped`、`apply_geometry_batch`、`update_elements`、`transform_elements`、`array_cubes`、`radial_array_cubes`、`duplicate_hierarchy`、`measure_model`、`audit_symmetry`、`create_limb`、`mirror_elements`                                                                                                                                                                                      |
| UV 与贴图 | `ensure_texture`、`ensure_material_set`、`audit_material_set`、`pack_box_uv`、`get_uv_layout`、`get_uv_map`、`transform_uv_islands`、`paint_face_grid`、`get_face_grid`、`get_texture_revision`、`edit_texture_pixels`、`flood_fill_texture`、`transform_texture_region`、`replace_texture_color`、`copy_face_pixels`、`analyze_texture_palette`、`audit_texture_quality`、`get_texture_region`、PNG IO |
| 动画      | `inspect_animation`、`upsert_animation`、`transform_animation_keys`、`list_animations`、`delete_animation`                                                                                                                                                                                                                                                                                              |
| 文件      | `propose_scoped_directory`、`save_project`、`export_model`                                                                                                                                                                                                                                                                                                                                              |

突变工具显式返回成功/失败；未知参数硬报错，不静默丢弃。优先 `check_model`，少刷截图。

现在已经补齐安全的“读取—修改—复查”闭环：`get_elements` 可读回精确几何和逐面 UV，
`update_elements` / `set_face_uv` 负责有边界的精修，然后可再次读取和预览确认。
`save_project` 会写出真实 `.bbmodel`，`export_model` 会调用当前格式的 Codec 编译；
两者都必须先确认会话目录，覆盖已有文件时必须显式传入 `overwrite: true`。

迭代建模不再需要手工重算全部绝对坐标：`transform_elements` 可执行相对平移、缩放和绕枢轴旋转；
`array_cubes` 用于重复结构，并明确选择共享或重新生成 UV。`measure_model` 返回整体或子树边界、中心、
尺寸、方块数和体积，`audit_symmetry` 返回左右配对的坐标误差。尺寸变化可选择
`uv_policy: preserve|auto`，绘制前应重新检查 UV 布局。

高级迭代进一步补齐：旋转和父级骨骼感知的世界边界、径向阵列、层级深复制、UV 岛整体变换，以及有意 UV 共享声明。
`ensure_material_set` 创建通道贴图，`audit_material_set` 检查 base/emissive/normal/specular 通道尺寸与命名一致性；
`analyze_view_silhouette` 将多视角截图量化为轮廓边界和覆盖率；动画关键帧可精确读取、重定时、缩放和按轴镜像。

## 推荐出模流程

1. `get_guide(modeling)`
2. `create_project`
3. 实体：`scaffold_biped`／方块：`apply_geometry_batch`
4. 修完 error 再贴图
5. `pack_box_uv` → `get_uv_layout`（越界必须为 0，并检查重叠与密度）→ `get_uv_map` → 绘制 → `get_texture` / `capture_views`
6. 需要时再 `capture_views`

真实 Blockbench 集成验证需先打开装好插件的临时工程，然后运行 `npm run test:e2e`。该命令要求显式确认工程可丢弃，
会执行真实的“建工程→几何→UV→贴图→审计→多视角”流程；它与稳定的单元测试刻意分离，避免伪装集成通过。

`capture_views` 和 `get_texture` 会返回原生 MCP 图片内容，兼容客户端可直接显示预览。
精细像素绘制可使用 `paint_pixel_batch`：一次提交多条逐面路径，支持方形／圆形笔刷，
默认裁剪在各自 UV 面内，并把整批操作合并为一次撤销。

每个正交视图还会返回 `visible_face`（`north` / `south` 等），表示朝向相机的模型面；
等轴视图返回 `null`。绘制脸部等焦点细节前应依此确认正面，不要沿用上一个工程的方向假设。

`get_uv_layout` 会结构化返回 UV 岛、重叠对、纹素密度、翻转、旋转和边界；
`get_uv_map` 返回带标签的图集预览。逐面绘制现已正确处理旋转／翻转 UV；局部打包默认保护已有 UV 岛，
`resize_texture` 可按最近邻同步缩放位图和全部 UV。

精确像素画现在优先使用 `paint_face_grid`：网格尺寸必须严格匹配目标面，调色板支持 CSS RGBA，
也可用 `null` 执行真正的透明擦除。`get_face_grid` 会按同一逐面方向无损读回 RGBA 像素。
此外还支持逐像素修补、容差替色、面贴图复制／镜像／旋转、调色板统计和带棋盘格的像素级放大预览。
PNG 导入导出只能访问经 `propose_scoped_directory` 明确确认的目录。

长流程可先调用 `get_texture_revision`，再把令牌作为 `expected_revision` 传给破坏性贴图操作；
若贴图已被其他操作更新，将拒绝旧方案覆盖。新增受限洪泛填充和无插值逐面／区域变换，
用于封闭区域、对称与方向修正。`audit_texture_quality` 会逐面检查调色板膨胀、底色占比、孤立噪点、
纯平填充；开启 `glass:true` 后还会检查透明材质边缘与中心的 Alpha 结构。

先看 `health` / `get_project_summary` 的 `uv_mode`：`java_block` 为逐面（face），Bedrock 类多为箱型（box）。

## Agent Skill

像素风建模手册：[`skills/blockbench-pixel-art/openai`](../skills/blockbench-pixel-art/openai/SKILL.md)。

## 许可证

MIT

## Bedrock 建模与本轮修复

新建独立实体项目，无需安装 GeckoLib，保留已有模型标签页：

```json
{
  "format": "bedrock",
  "name": "国庆时装",
  "geometry_name": "national_day_costume",
  "uv_mode": "face",
  "texture_width": 256,
  "texture_height": 256
}
```

将以上参数传给 `create_project`。`bedrock_old` 只用于旧版格式；不支持的 UV 模式会在新建前报错，不会悄悄转换参考模型。

- 骨骼与方块分别写入正确的 Undo aspects，修复 `getUndoCopy is not a function`，并保留编辑前后的撤销数据。
- `update_elements` 更新坐标、旋转、可见性后立即刷新模型和骨骼，无需重新打开文件。
- `transform_elements` 对整个子树生效，父子重复选择只变换一次；坐标位于选中根节点的父级空间。旋转围绕指定枢轴复合；会产生剪切的非均匀缩放明确拒绝。
- `capture_views` 按可见方块及其骨骼旋转、膨胀量自动取景；不移动模型，不改变用户的交互视角。
- 文件操作支持插件作用域内的 `require`，不再仅依赖 `globalThis.require`。桌面模块权限、目录授权和显式覆盖保护仍保留，不绕过拒绝授权。
- `save_project` 保存可编辑的 `.bbmodel`；`export_model` 使用当前 Bedrock codec 输出几何 JSON，不等同于打包完整资源包。

验证命令：`npm test`、`npm run typecheck`、`npm run build`。新增宿主模拟回归测试覆盖上述故障，但不替代真实桌面端验收。不要在用户正在编辑的模型上运行破坏性的 `test:e2e`。

构建产物为 `packages/plugin/dist/blockbench_mcp.js`。在 Blockbench 中重新加载该文件后，新能力才会进入 MCP 工具列表；本次代码修改不会自动重载插件或修改当前模型。
