// Worker とやり取りするメッセージの形と、頼まれたら考えて答える処理
import type { Action, GameState } from '../rules/types';
import { chooseCpuAction, type Level } from './levels';

export interface ThinkRequest { id: number; view: GameState; level: Level; seed: number }
export type ThinkResponse = { id: number; action: Action } | { id: number; error: string };

// 例外は error に入れて返す（Worker が落ちないように）
export function handleThinkRequest(req: ThinkRequest): ThinkResponse {
  try {
    return { id: req.id, action: chooseCpuAction(req.view, req.level, req.seed).action };
  } catch (e) {
    return { id: req.id, error: e instanceof Error ? e.message : String(e) };
  }
}
