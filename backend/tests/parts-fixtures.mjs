import { randomUUID } from 'node:crypto';
import { asUser, user } from './helpers.mjs';

export const actionRpc = 'select public.apply_booking_action($1) result';
export const action = (bookingId, name, expectedVersion, payload = {}, idempotencyKey = randomUUID()) =>
  ({ bookingId, action: name, expectedVersion, payload, idempotencyKey });
export async function apply(db, actor, body) {
  await asUser(db, actor);
  return (await db.query(actionRpc, [body])).rows[0].result;
}
export async function makeApproved(db, fixture, { customer = 3, partsActor = 13, labourOnly = false } = {}) {
  await asUser(db, customer);
  const booking = (await db.query('select public.create_booking($1) result', [{
    shopId: fixture.shopId, slotId: fixture.slotId, serviceIds: [fixture.serviceId], symptomNotes: '',
    vehicle: { registrationPlate: `B08-${randomUUID().slice(0,8)}`, make: 'Toyota', model: 'Corolla', year: 2018 }, idempotencyKey: randomUUID(),
  }])).rows[0].result.booking;
  const estimate = { diagnosisNote: 'Native B08 inspection requires belt replacement.', items: [
    ...(labourOnly ? [] : [
      { kind: 'PART', partId: fixture.partId, descriptionSnapshot: 'Belt one', quantity: 1, unitPricePkr: 100 },
      { kind: 'PART', partId: fixture.partId, descriptionSnapshot: 'Belt two', quantity: 2, unitPricePkr: 100 },
      { kind: 'PART', partId: fixture.secondPartId, descriptionSnapshot: 'Clips', quantity: 2, unitPricePkr: 50 },
    ]),
    { kind: 'LABOUR', descriptionSnapshot: 'Replacement labour', quantity: 1, unitPricePkr: 500 },
  ] };
  await apply(db,11,action(booking.id,'CONFIRM_BOOKING',0));
  await apply(db,11,action(booking.id,'ASSIGN_TECHNICIAN',1,{technicianUserId:user(12)}));
  await apply(db,12,action(booking.id,'START_INSPECTION',2));
  await apply(db,12,action(booking.id,'SUBMIT_ESTIMATE',3,estimate));
  await apply(db,11,action(booking.id,'SEND_ESTIMATE',4,estimate));
  await apply(db,customer,action(booking.id,'APPROVE_ESTIMATE',5));
  await apply(db,11,action(booking.id,'ASSIGN_PARTS',6,{partsUserId:user(partsActor)}));
  return booking.id;
}
export async function setup(db, { stock = 0, labourOnly = false } = {}) {
  await asUser(db,1);
  const shop = (await db.query('select public.save_shop(null,$1) s',[{
    name:`B08 Native ${randomUUID()}`, city:'Lahore',address:'Disposable B08 fixture',phone:'+920000000000',slotCapacity:4,
    workingHours:Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[['09:00','18:00']]])),
  }])).rows[0].s;
  const service=(await db.query('select public.save_service($1,null,$2) s',[shop.id,{name:'B08 inspection',durationMinutes:60}])).rows[0].s;
  await db.query('reset role');
  await db.query(`insert into public.shop_memberships(shop_id,user_id,role) values
    ($1,$2,'SA'),($1,$3,'TECHNICIAN'),($1,$4,'PARTS'),($1,$5,'PARTS'),($1,$6,'QC'),($1,$7,'QC')`,
    [shop.id,user(11),user(12),user(13),user(23),user(14),user(24)]);
  await asUser(db,13);
  const save=async(input)=>(await db.query('select public.save_inventory_part($1) p',[{shopId:shop.id,...input}])).rows[0].p;
  const part=await save({sku:'BELT',name:'B08 belt',quantityOnHand:stock,unitCostPkr:90});
  const second=await save({sku:'CLIP',name:'B08 clips',quantityOnHand:20,unitCostPkr:20});
  await db.query('reset role');
  const slot=(await db.query(`select id from public.appointment_slots where shop_id=$1
    and (starts_at at time zone 'Asia/Karachi')::date=(clock_timestamp() at time zone 'Asia/Karachi')::date+1
    order by starts_at limit 1`,[shop.id])).rows[0];
  const fixture={shopId:shop.id,serviceId:service.id,slotId:slot.id,partId:part.id,secondPartId:second.id};
  fixture.bookingId=await makeApproved(db,fixture,{labourOnly});
  await db.query('reset role');
  fixture.shopId=(await db.query('select shop_id as "shopId" from public.bookings where id=$1',[fixture.bookingId])).rows[0].shopId;
  return fixture;
}
