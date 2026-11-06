import { profileLabel } from './TownProfiles';
import { MANUAL_SLOTS } from './ManualSaves';
import type { GameStart } from './GameStart';
export interface MenuAction {
  id: string;
  text: string;
  run: () => void;
  enabled?: boolean;
  caution?: boolean;
  reason?: string;
}
export interface StartMenuData {
  title: string;
  subtitle: string;
  detail: string;
  actions: MenuAction[];
}
const summary = (state: { coins: number; buildings: unknown[] }) =>
  `金币 ${state.coins} · 建筑 ${state.buildings.length}`;
/** All menu choices are real actions, layered above the real-time demo island. */
export function startMenu(flow: GameStart, openGuide: () => void): StartMenuData {
  const back = {
    id: 'back',
    text: flow.returnsToSettings ? '返回设置' : flow.session ? '返回游戏' : '返回标题',
    run: () => flow.back(),
  };
  const name = profileLabel(flow.profile);
  const reset = {
    id: 'new-game',
    text:
      flow.profile === 'v5-bridge-demo'
        ? '重置木桥演示…'
        : flow.profile === 'v5-preview'
          ? '重置 v5 预览…'
          : flow.profile === 'demo'
            ? '重置演示岛…'
            : '重新开始…',
    caution: true,
    run: () => flow.newGame(),
  };
  if (flow.page === 'settings')
    return {
      title: '设置',
      subtitle: name,
      detail: '每次操作后自动保存。\n小镇事务：购买作物、种树与切换小镇。',
      actions: [
        { id: 'save-now', text: '立即保存', run: () => flow.saveNow() },
        { id: 'saves', text: '存档管理', run: () => flow.saves() },
        { id: 'town-actions', text: '小镇事务', run: () => flow.openTownActions() },
        reset,
        { id: 'exit', text: '返回标题…', run: () => flow.exit() },
        back,
      ],
    };
  if (flow.page === 'confirm')
    return {
      title: '请确认',
      subtitle: name,
      detail: flow.pending?.text ?? '',
      actions: [
        { id: 'confirm', text: '确认', caution: true, run: () => flow.confirm() },
        { id: 'cancel', text: '取消', run: () => flow.back() },
      ],
    };
  if (flow.page === 'exit')
    return { title: '下次再见', subtitle: 'TOWN EVOLUTION', detail: flow.message, actions: [back] };
  if (flow.page === 'slot') {
    const slot = flow.inspectSlot();
    return {
      title: `手动存档 ${flow.slot}`,
      subtitle: name,
      detail:
        slot.status === 'ready'
          ? `${new Date(slot.savedAt).toLocaleString()}\n${summary(slot.state)}`
          : slot.status === 'empty'
            ? '空栏位\n进入游戏后，可以把当前进度存放在这里。'
            : '此栏位无法读取，原始内容仍保留。',
      actions: [
        ...(flow.session
          ? [{ id: 'write-slot', text: '保存到此栏位', run: () => flow.saveSlot() }]
          : []),
        {
          id: 'load-slot',
          text: '读取此存档',
          enabled: slot.status === 'ready',
          reason: '此栏位没有可读取的存档。',
          run: () => flow.loadSlot(),
        },
        { ...back, text: '返回存档' },
      ],
    };
  }
  if (flow.page === 'saves') {
    const saved = flow.inspect();
    const detail =
      saved.status === 'loaded'
        ? `自动存档 · ${summary(saved.state)}\n每次操作后自动保存，另有上一份自动备份。`
        : (saved.warning ?? '尚无自动存档，开始游戏即可创建。');
    return {
      title: '存档',
      subtitle: `${name} · 独立保存`,
      detail,
      actions: [
        ...(flow.session
          ? [{ id: 'save-now', text: '立即保存', run: () => flow.saveNow() }]
          : saved.status === 'recovered'
            ? [{ id: 'recover', text: '采用自动备份', run: () => flow.recover() }]
            : saved.status !== 'corrupt'
              ? [
                  {
                    id: 'continue',
                    text: saved.status === 'empty' ? '开始游戏' : '继续自动存档',
                    run: () => flow.start(flow.profile),
                  },
                ]
              : []),
        ...(flow.session?.hasSaveConflict
          ? [
              {
                id: 'reload-latest',
                text: '读取其他页面的最新进度',
                run: () => flow.reloadLatest(),
              },
            ]
          : []),
        ...MANUAL_SLOTS.map((slot) => ({
          id: `slot-${slot}`,
          text: `手动存档 ${slot} · ${{ ready: '已有进度', empty: '空', corrupt: '需检查' }[flow.inspectSlot(slot).status]}`,
          run: () => flow.chooseSlot(slot),
        })),
        reset,
        ...(!flow.session
          ? [
              {
                id: 'profile',
                text: flow.profile === 'demo' ? '查看我的小镇' : '查看演示岛',
                run: () => flow.chooseProfile(flow.profile === 'demo' ? 'normal' : 'demo'),
              },
            ]
          : []),
        back,
      ],
    };
  }
  const normal = flow.inspect('normal');
  return {
    title: '小镇进化',
    subtitle: 'TOWN EVOLUTION',
    detail: '从一座小岛，慢慢长成你的家。',
    actions: [
      {
        id: 'start',
        text:
          normal.status === 'loaded'
            ? '继续游戏'
            : normal.status === 'empty'
              ? '开始游戏'
              : '检查与恢复存档',
        run: () => flow.start('normal'),
      },
      { id: 'demo', text: '游览演示岛', run: () => flow.start('demo') },
      { id: 'v5-preview', text: 'v5 新岛预览', run: () => flow.start('v5-preview') },
      { id: 'v5-bridge-demo', text: '木桥演示', run: () => flow.start('v5-bridge-demo') },
      { id: 'saves', text: '存档', run: () => flow.saves() },
      { id: 'guide', text: '图鉴', run: openGuide },
      { id: 'exit', text: '退出', run: () => flow.exit() },
    ],
  };
}
