# MVP architecture and business rules

## 架构概览

业务规则与 Cocos 表现分离：UI 只能提交命令，不能直接增减资源；规则层不导入引擎，输入状态、命令和时间，输出新状态或失败原因。失败时原状态保持不变。

建筑分类不使用层层继承，实例引用配置中的类型与能力。建造／改造、生产／领取、订单分别放在独立模块。模型显示只依赖业务快照，通过共用主体与附件反映分支。

存档是带版本号的纯数据，不保存引擎节点。读取时检查编号、位置、容量和生产任务；损坏文件先保留，再由玩家明确选择恢复或重置。未来版本存档不自动回退到旧备份。

网页和 Android 共享这套规则。平台接口、镜头输入、UI 与模型资源留在外围；增加平台不应复制整套经营逻辑。以下英文细则是本轮原型的实现边界与参数。

## Scope

Code-first Cocos Creator 3.8.8 + TypeScript prototype for Web and Android. Small local single-player town, fixed-view low-poly presentation, grid placement and modular building variants. Runtime editor/device verification remains separate from source tests.

The selected first loop is plant → collect vegetables → fulfill fixed orders → build or remodel storage. Warehouse expansion and warehouse + adjacent cooling facility are deliberate _prototype recipes_, not a final exhaustive design.

## Layers

1. **Domain** (`assets/scripts/domain`): deterministic state transitions, validated commands, building definitions and production/combination rules. Explicit clock input. No Cocos dependency.
2. **Persistence** (`assets/scripts/domain/storage.ts`): versioned serialization and a small injected key/value interface. Cocos provides `sys.localStorage`; tests use an in-memory implementation.
3. **Application** (`assets/scripts/application`): injected clock/storage session orchestration and pure responsive layout math, tested without Cocos.
4. **Presentation** (`assets/scripts/presentation`): Cocos camera, low-poly geometry, grid interaction and UI. Domain events drive visual updates. This layer does not own economic state.
5. **Platform/export**: Creator project/scene and standard build workflow. Separate future platform integrations are not required for local gameplay.

## State

- `schemaVersion`, integer coins, vegetable and chilled-vegetable inventories, order count.
- Buildings have stable IDs, kind, grid coordinate, rotation and at most one job.
- Jobs have stable IDs, start time and ready time. Completed jobs stay until successfully collected.
- `nextId` is monotonically increasing and checked during import; `lastSeenAt` prevents in-session clock rollback from reversing progress.
- JSON saves contain only the explicit state schema, not Cocos nodes or model assets.

## Atomic commands

The public `game.ts` facade delegates to small modules: `types`, `config`, `state`, `geometry`, `guards`, `save`, and `actions/construction`, `actions/production`, `actions/orders`. Each action clones the input state. Any rejected validation returns the original input unchanged. Currency deduction and building transitions are committed together only after all relevant checks.

- Place: whitelist buildable kinds, grid bounds, overlap, rotation and affordability.
- Start: require productive building without another job. Farms yield four vegetables after 15 seconds. Cold warehouses consume two vegetables immediately and yield two chilled vegetables after ten seconds.
- Collect: require ready task and enough storage; add products and remove task atomically. Repeated collect cannot duplicate inventory. Full storage preserves the task.
- Upgrade: base warehouse to expanded warehouse, cost 40, capacity 16 → 32, same footprint represented by a second floor.
- Combine: base warehouse and edge-adjacent cooling facility, cost 20; consume the cooler, retain warehouse ID and change kind to cold warehouse. Diagonal proximity is not adjacency. Capacity stays 16 and cold processing becomes available.
- Sell: four vegetables for 24 coins or two chilled vegetables for 24 coins. Fixed repeatable orders simplify the MVP economy.

Start with 120 coins, one warehouse and one farm, so the loop is immediately testable. Another farm costs 20, a base warehouse 50, a cooler 40. Numbers are short-test tuning, not long-term balance.

## Time and offline rules

Only scheduled work progresses while away. No background infinite production, server polling or catch-up simulation. On return, compare task completion with effective time; products are issued only through collect. Clock advances use the larger of supplied time and last seen time. This is a convenience guard, not anti-cheat: local clocks and saves can be edited. No competitive or paid economy is claimed.

## Save safety

Import validates version, integer ranges, known building kinds, unique IDs, next-ID sequence, map bounds/overlap, inventory capacity, job duration and allowed productive buildings. Unknown future versions fail without replacement or automatic downgrade to an older backup. No migration exists yet because version 1 is the first schema; future migrations must be explicit and tested.

Each normal save backs up the previous valid primary. If primary data is invalid, save refuses to overwrite it. Load may offer a valid backup with a warning; accepting recovery preserves unreadable raw data. Reset preserves the most recent pre-reset copy (a subsequent reset replaces that recovery slot) and requires explicit presentation confirmation. Storage-denied and quota errors must remain visible.

## Deferred

Free-form building crossbreeding, growth trees, residents/AI, logistics simulation, food spoilage, cloud sync, account/login, payments, ads, TapTap SDK and release qualifications. Publishing an APK and obtaining platform approval are distinct from producing source code.
