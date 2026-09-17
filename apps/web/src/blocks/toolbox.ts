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
      ],
    },
  ],
};
