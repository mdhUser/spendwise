import type {CallBudget,CallKind} from './contracts';
export function createCallBudget():CallBudget{
 const left:Record<CallKind,number>={search:12,detail:6,model:3};
 return {take(kind){if(left[kind]<=0)return false;left[kind]--;return true;},remaining:kind=>left[kind]};
}
