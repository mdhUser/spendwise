import {platformNames,platforms,type ShoppingNeedsPatch} from '@/lib/shopping/contracts';
export function ShoppingPreferences({needs}:{needs:ShoppingNeedsPatch}){
 return <><div className="form-grid">
 <label>品牌偏好<input name="brands" defaultValue={needs.brands?.join('、')??''} maxLength={200} placeholder="多个品牌用顿号分隔"/></label>
 <label>配送地区<input name="regionCode" defaultValue={needs.regionCode??''} maxLength={80} placeholder="省市区；运费仍需平台确认"/></label>
 <label className="checkbox"><input name="allowStockpile" type="checkbox" defaultChecked={needs.allowStockpile}/>接受按需囤货</label>
 <label>最多购买包数<input name="maxPacks" type="number" min="1" max="50" defaultValue={needs.maxPacks??''}/></label>
 <label>所需总用量<input name="targetValue" type="number" min="1" max="1000000" defaultValue={needs.targetAmount?.value??''}/></label>
 <label>用量单位<select name="targetUnit" defaultValue={needs.targetAmount?.unit??'draw'}><option value="draw">抽</option><option value="g">克</option><option value="ml">毫升</option></select></label>
 </div><div className="form-grid">{platforms.map(p=><div key={p}>{(['member','firstOrder'] as const).map(field=><label key={field}>{platformNames[p]}{field==='member'?'会员优惠资格':'首购优惠资格'}<select name={`${p}_${field}`} defaultValue={needs.eligibility?.[p]?.[field]===true?'yes':needs.eligibility?.[p]?.[field]===false?'no':'unknown'}><option value="unknown">不确定</option><option value="yes">已确认适用</option><option value="no">不适用</option></select></label>)}</div>)}</div></>;
}
