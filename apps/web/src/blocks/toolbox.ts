/** ブロックエディタのツールボックス（カテゴリ分けされたブロック一覧）定義。 */
export const FAMIJS_TOOLBOX = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "グローバル変数",
      colour: "40",
      contents: [{ kind: "block", type: "fjs_let" }],
    },
    {
      kind: "category",
      name: "イベント",
      colour: "210",
      contents: [{ kind: "block", type: "fjs_event_init" }, { kind: "block", type: "fjs_event_update" }],
    },
    {
      kind: "category",
      name: "変数の操作",
      colour: "330",
      contents: [
        { kind: "block", type: "fjs_assign" },
        { kind: "block", type: "fjs_assign_add" },
        { kind: "block", type: "fjs_assign_sub" },
      ],
    },
    {
      kind: "category",
      name: "条件分岐",
      colour: "260",
      contents: [{ kind: "block", type: "fjs_if" }],
    },
    {
      kind: "category",
      name: "条件（if の中に入れる）",
      colour: "20",
      contents: [
        { kind: "block", type: "fjs_btn" },
        { kind: "block", type: "fjs_compare" },
        { kind: "block", type: "fjs_var_truthy" },
      ],
    },
    {
      kind: "category",
      name: "画面・音",
      colour: "160",
      contents: [
        { kind: "block", type: "fjs_call_setpalette" },
        { kind: "block", type: "fjs_call_setspritepalette" },
        { kind: "block", type: "fjs_call_drawsprite" },
        { kind: "block", type: "fjs_call_playtone" },
      ],
    },
    {
      kind: "category",
      name: "値",
      colour: "0",
      contents: [
        { kind: "block", type: "fjs_number" },
        { kind: "block", type: "fjs_variable_get" },
        { kind: "block", type: "fjs_compare_expr" },
      ],
    },
    {
      kind: "category",
      name: "パーツ (part)",
      colour: "290",
      contents: [
        { kind: "block", type: "fjs_part_decl" },
        { kind: "block", type: "fjs_field_decl" },
        { kind: "block", type: "fjs_behavior_decl" },
        { kind: "block", type: "fjs_self_field_get" },
        { kind: "block", type: "fjs_self_field_set" },
        { kind: "block", type: "fjs_self_field_add" },
        { kind: "block", type: "fjs_self_field_sub" },
      ],
    },
    {
      kind: "category",
      name: "シーン (scene)",
      colour: "130",
      contents: [
        { kind: "block", type: "fjs_scene_decl" },
        { kind: "block", type: "fjs_instance_decl" },
        { kind: "block", type: "fjs_scene_event_init" },
        { kind: "block", type: "fjs_scene_event_update" },
        { kind: "block", type: "fjs_call_behavior" },
        { kind: "block", type: "fjs_instance_field_get" },
        { kind: "block", type: "fjs_instance_field_set" },
        { kind: "block", type: "fjs_instance_field_add" },
        { kind: "block", type: "fjs_instance_field_sub" },
      ],
    },
  ],
};

/**
 * パーツ専用ワークスペース用のツールボックス（Phase 6）。
 * ワークスペース自体が「1つのpart本体」を表すため、fjs_part_decl等の外枠ブロックは含めない。
 */
export const PART_TOOLBOX = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "フィールド/振る舞い",
      colour: "290",
      contents: [
        { kind: "block", type: "fjs_field_decl" },
        { kind: "block", type: "fjs_behavior_decl" },
        { kind: "block", type: "fjs_self_field_get" },
        { kind: "block", type: "fjs_self_field_offset" },
        { kind: "block", type: "fjs_self_field_set" },
        { kind: "block", type: "fjs_self_field_add" },
        { kind: "block", type: "fjs_self_field_sub" },
      ],
    },
    {
      kind: "category",
      name: "条件分岐",
      colour: "260",
      contents: [{ kind: "block", type: "fjs_if" }],
    },
    {
      kind: "category",
      name: "条件（if の中に入れる）",
      colour: "20",
      contents: [
        { kind: "block", type: "fjs_btn" },
        { kind: "block", type: "fjs_compare_expr" },
        { kind: "block", type: "fjs_var_truthy" },
      ],
    },
    {
      kind: "category",
      name: "画面・音",
      colour: "160",
      contents: [
        { kind: "block", type: "fjs_call_setpalette" },
        { kind: "block", type: "fjs_call_setspritepalette" },
        { kind: "block", type: "fjs_call_drawsprite" },
        { kind: "block", type: "fjs_call_playtone" },
      ],
    },
    {
      kind: "category",
      name: "値",
      colour: "0",
      contents: [
        { kind: "block", type: "fjs_number" },
        { kind: "block", type: "fjs_compare_expr" },
      ],
    },
  ],
};

/**
 * シーン専用ワークスペース用のツールボックス（Phase 6）。
 * ワークスペース自体が「1つのscene本体」を表すため、fjs_scene_decl等の外枠ブロックは含めない。
 */
export const SCENE_TOOLBOX = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "配置/進行",
      colour: "130",
      contents: [
        { kind: "block", type: "fjs_instance_decl" },
        { kind: "block", type: "fjs_scene_event_init" },
        { kind: "block", type: "fjs_scene_event_update" },
        { kind: "block", type: "fjs_call_behavior" },
        { kind: "block", type: "fjs_instance_field_get" },
        { kind: "block", type: "fjs_instance_field_set" },
        { kind: "block", type: "fjs_instance_field_add" },
        { kind: "block", type: "fjs_instance_field_sub" },
      ],
    },
    {
      kind: "category",
      name: "条件分岐",
      colour: "260",
      contents: [{ kind: "block", type: "fjs_if" }, { kind: "block", type: "fjs_on_overlap" }],
    },
    {
      kind: "category",
      name: "条件（if の中に入れる）",
      colour: "20",
      contents: [{ kind: "block", type: "fjs_btn" }],
    },
    {
      kind: "category",
      name: "画面・音",
      colour: "160",
      contents: [
        { kind: "block", type: "fjs_call_setpalette" },
        { kind: "block", type: "fjs_call_setspritepalette" },
        { kind: "block", type: "fjs_call_playtone" },
        { kind: "block", type: "fjs_call_gotoscene" },
      ],
    },
    {
      kind: "category",
      name: "値",
      colour: "0",
      contents: [
        { kind: "block", type: "fjs_number" },
        { kind: "block", type: "fjs_compare_expr" },
      ],
    },
  ],
};

/**
 * マッパー別ツールボックス。
 * 現状の DSL 命令はマッパー共通のため中身は同じ。
 * 非 NROM では「バンク（準備中）」カテゴリを足して、選べる範囲の差を UI で示す。
 */
export function partToolboxForMapper(mapperId: number): typeof PART_TOOLBOX {
  if (mapperId === 0) return PART_TOOLBOX;
  return {
    kind: "categoryToolbox",
    contents: [
      ...PART_TOOLBOX.contents,
      {
        kind: "category",
        name: "バンク（準備中）",
        colour: "65",
        contents: [],
      },
    ],
  };
}

export function sceneToolboxForMapper(mapperId: number): typeof SCENE_TOOLBOX {
  if (mapperId === 0) return SCENE_TOOLBOX;
  return {
    kind: "categoryToolbox",
    contents: [
      ...SCENE_TOOLBOX.contents,
      {
        kind: "category",
        name: "バンク（準備中）",
        colour: "65",
        contents: [],
      },
    ],
  };
}
