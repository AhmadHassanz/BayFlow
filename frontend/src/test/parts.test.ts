import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/response';
import { bookingActionInput } from '@/lib/contracts/booking-actions';
import { inventoryInput } from '@/lib/contracts/parts';

const mocks=vi.hoisted(()=>({identity:vi.fn(),apply:vi.fn(),list:vi.fn(),save:vi.fn(),lookup:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireIdentity:mocks.identity}));
vi.mock('@/server/services/booking-actions',()=>({applyBookingAction:mocks.apply}));
vi.mock('@/server/services/parts',()=>({listInventory:mocks.list,saveInventoryPart:mocks.save,purchaseOrderBooking:mocks.lookup}));
import { GET as inventory, POST as save } from '@/app/api/v1/shops/[id]/inventory/route';
import { POST as order } from '@/app/api/v1/bookings/[id]/purchase-orders/route';
import { POST as receive } from '@/app/api/v1/purchase-orders/[id]/receive/route';
import { POST as allocate } from '@/app/api/v1/bookings/[id]/allocate-parts/route';

const id='b0800000-0000-4000-8000-000000000001';
const context={params:Promise.resolve({id})};
const request=(body:unknown,origin='http://localhost:3000')=>new Request(`http://localhost:3000/api/v1/bookings/${id}/purchase-orders`,{
  method:'POST',headers:{Origin:origin},body:JSON.stringify(body),
});
const mutation={expectedVersion:8,idempotencyKey:id};
beforeEach(()=>{
  vi.resetAllMocks(); mocks.identity.mockResolvedValue({client:{},user:{id}});
  mocks.apply.mockResolvedValue({booking:{id,status:'PARTS_READY'},replayed:false});
  mocks.lookup.mockResolvedValue(id); mocks.list.mockResolvedValue({items:[],page:1,pageSize:50,total:0});
  mocks.save.mockResolvedValue({id,quantityOnHand:0});
});
it('B08 action validation covers assignment, order, receipt, readiness and allocation',()=>{
  for(const [action,payload] of [
    ['ASSIGN_PARTS',{partsUserId:id.toUpperCase()}],['MARK_PARTS_READY',{}],
    ['ORDER_PARTS',{items:[{partId:id,quantity:2}]}],['RECEIVE_PARTS',{purchaseOrderId:id,items:[{partId:id,quantity:1}]}],['ALLOCATE_PARTS',{}],
  ]) expect(bookingActionInput.parse({...mutation,action,payload}).action).toBe(action);
  for(const payload of [{items:[]},{items:[{partId:id,quantity:0}]},{items:[{partId:id,quantity:1},{partId:id,quantity:1}]},
    {items:[{partId:id,quantity:1,quantityReceived:2}]},{items:[{partId:id,quantity:1}],subtotalPkr:100}])
    expect(()=>bookingActionInput.parse({...mutation,action:'ORDER_PARTS',payload})).toThrow();
});
it('B08 inventory rejects existing-stock overwrite and unknown fields',()=>{
  const base={sku:' BELT ',name:' Belt ',unitCostPkr:100};
  expect(inventoryInput.parse(base)).toMatchObject({sku:'BELT',name:'Belt',reorderLevel:0});
  expect(()=>inventoryInput.parse({...base,id,quantityOnHand:20})).toThrow();
  expect(()=>inventoryInput.parse({...base,shopId:id})).toThrow();
});
it('purchase order and allocation routes use the shared guarded action with server-bound booking ID',async()=>{
  expect((await order(request({...mutation,items:[{partId:id,quantity:2}],supplierName:' Supplier '}),context)).status).toBe(201);
  expect(mocks.apply).toHaveBeenLastCalledWith({},id,{action:'ORDER_PARTS',...mutation,payload:{items:[{partId:id,quantity:2}],supplierName:'Supplier'}});
  mocks.apply.mockResolvedValue({booking:{id},replayed:true});
  expect((await allocate(request(mutation),context)).status).toBe(200);
  expect(mocks.apply).toHaveBeenLastCalledWith({},id,{action:'ALLOCATE_PARTS',...mutation,payload:{}});
});
it('receipt binds the visible purchase order to its authoritative booking',async()=>{
  expect((await receive(request({...mutation,items:[{partId:id,quantity:1}]}),context)).status).toBe(201);
  expect(mocks.lookup).toHaveBeenCalledWith({},id);
  expect(mocks.apply).toHaveBeenCalledWith({},id,{action:'RECEIVE_PARTS',...mutation,payload:{purchaseOrderId:id,items:[{partId:id,quantity:1}]}});
  mocks.lookup.mockRejectedValue(new ApiError(404,'NOT_FOUND','Purchase order was not found.'));
  mocks.apply.mockClear();
  expect((await receive(request({...mutation,items:[{partId:id,quantity:1}]}),context)).status).toBe(404);
  expect(mocks.apply).not.toHaveBeenCalled();
});
it.each([order,receive,allocate,save])('B08 mutations reject foreign origins before identity lookup',async route=>{
  expect((await route(request(mutation,'https://bad.test'),context)).status).toBe(403);
  expect(mocks.identity).not.toHaveBeenCalled();
});
it.each([order,receive,allocate,save])('B08 mutations require a verified session',async route=>{
  mocks.identity.mockRejectedValue(new ApiError(401,'UNAUTHENTICATED','Sign in.'));
  expect((await route(request(mutation),context)).status).toBe(401);
});
it('inventory pagination rejects unknown and duplicate parameters and returns private data',async()=>{
  for(const suffix of ['?page=0','?page=1&page=2','?role=OWNER','?page=1.5'])
    expect((await inventory(new Request(`http://localhost:3000/api/v1/shops/${id}/inventory${suffix}`),context)).status).toBe(400);
  const r=await inventory(new Request(`http://localhost:3000/api/v1/shops/${id}/inventory?page=2`),context);
  expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.list).toHaveBeenCalledWith({},id,2);
});
it('stock conflicts map to safe responses',async()=>{
  mocks.apply.mockRejectedValue(new ApiError(409,'STOCK_CONFLICT','Required parts are no longer available. Reload this booking.'));
  const r=await allocate(request(mutation),context);
  expect(r.status).toBe(409); expect((await r.json()).error.code).toBe('STOCK_CONFLICT');
});
