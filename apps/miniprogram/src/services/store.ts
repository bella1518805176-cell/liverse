import {
  type Layout,
  type PositionRef,
  positionKey,
} from "../../../../packages/contracts";
import { addCompare } from "../../../../packages/venue-core";
type Local = {
  schemaVersion: 1;
  favorites: PositionRef[];
  recent: PositionRef[];
  map: {
    floor: string;
    scale: number;
    offsetX: number;
    offsetY: number;
    selected?: PositionRef;
  } | null;
};
function read(): Local {
  const stored = wx.getStorageSync("lv:local:v1");
  return stored?.schemaVersion === 1
    ? (stored as Local)
    : { schemaVersion: 1, favorites: [], recent: [], map: null };
}
let local = read();
let compare: PositionRef[] = [];
let activeLayout: Layout | null = null;
function save() {
  wx.setStorageSync("lv:local:v1", local);
}
export const store = {
  get local() {
    return local;
  },
  get compare() {
    return compare;
  },
  get layout() {
    return activeLayout;
  },
  setLayout(layout: Layout) {
    activeLayout = layout;
  },
  favorite(p: PositionRef) {
    const key = positionKey(p);
    if (local.favorites.some((item) => positionKey(item) === key))
      local.favorites = local.favorites.filter(
        (item) => positionKey(item) !== key,
      );
    else local.favorites.unshift(p);
    save();
  },
  visit(p: PositionRef) {
    local.recent = [
      p,
      ...local.recent.filter((item) => positionKey(item) !== positionKey(p)),
    ].slice(0, 20);
    save();
  },
  map(value: Local["map"]) {
    local.map = value;
    save();
  },
  addCompare(p: PositionRef, replace?: number) {
    compare = addCompare(compare, p, replace);
  },
  removeCompare(i: number) {
    compare = compare.filter((_, j) => i !== j);
  },
  clear() {
    local = { schemaVersion: 1, favorites: [], recent: [], map: null };
    save();
  },
};
export async function chooseCompare(p: PositionRef) {
  try {
    store.addCompare(p);
  } catch (e) {
    if (
      store.compare.length === 2 &&
      store.compare[0].layoutVersionId === p.layoutVersionId
    ) {
      const { tapIndex } = await wx.showActionSheet({
        itemList: ["替换位置 A", "替换位置 B"],
      });
      store.addCompare(p, tapIndex);
    } else throw e;
  }
  wx.showToast({ title: "已加入对比", icon: "success" });
}
