import { ObjectId, type Document } from "mongodb";
import { getMongoCollection } from "@/lib/mongo";

export type ReviewRecord = {
  _id: ObjectId;
  productId: string;
  customerId: string;
  customerName: string;
  rating: number;
  comment: string;
  vendorReply: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listProductReviews(productId: string) {
  const collection = await getMongoCollection<ReviewRecord & Document>("productReviews");
  if (!collection) return null;
  const docs = await collection.find({ productId }).sort({ createdAt: -1 }).limit(50).toArray();
  return docs.map(({ _id, ...review }) => ({ id: _id.toString(), ...review }));
}

export async function addProductReview(review: Omit<ReviewRecord, "_id">) {
  const collection = await getMongoCollection<ReviewRecord & Document>("productReviews");
  if (!collection) throw new Error("MongoDB is unavailable. Reviews cannot be saved right now.");
  await collection.insertOne({ ...review, _id: new ObjectId() });
  const [aggregate] = await collection.aggregate<{ average: number; count: number }>([
    { $match: { productId: review.productId } },
    { $group: { _id: "$productId", average: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]).toArray();
  return { average: Math.round((aggregate?.average ?? 0) * 100) / 100, count: aggregate?.count ?? 0 };
}

export async function addVendorReply(reviewId: string, productId: string, vendorId: string, reply: string) {
  if (!ObjectId.isValid(reviewId)) return false;
  const collection = await getMongoCollection<ReviewRecord & Document>("productReviews");
  if (!collection) throw new Error("MongoDB is unavailable. Vendor replies cannot be saved right now.");
  const result = await collection.updateOne({ _id: new ObjectId(reviewId), productId, vendorReply: null }, { $set: { vendorReply: reply, updatedAt: new Date(), repliedByVendorId: vendorId } });
  return result.modifiedCount === 1;
}

export type CouponRecord = {
  _id: ObjectId;
  code: string;
  funding: "PLATFORM" | "VENDOR";
  vendorId: string | null;
  discountType: "FIXED" | "PERCENT";
  value: number;
  maxDiscountPaise: number | null;
  minimumOrderPaise: number;
  usageLimit: number;
  usedCount: number;
  reservedCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  createdAt: Date;
  createdBy: string;
};

type CouponReservation = {
  reservationKey: string;
  customerId: string;
  couponId: ObjectId;
  code: string;
  funding: "PLATFORM" | "VENDOR";
  vendorId: string | null;
  discountPaise: number;
  status: "RESERVED" | "USED" | "RELEASED";
  orderId?: string;
  createdAt: Date;
};

export type ReservedCoupon = Pick<CouponReservation, "reservationKey" | "code" | "funding" | "vendorId" | "discountPaise">;

export function calculateCouponDiscount(coupon: CouponRecord, subtotalPaise: number, vendorSubtotals: Map<string, number>) {
  const now = new Date();
  if (!coupon.active || (coupon.startsAt && coupon.startsAt > now) || (coupon.endsAt && coupon.endsAt < now)) throw new Error("This coupon is invalid or inactive.");
  if (coupon.usedCount + coupon.reservedCount >= coupon.usageLimit) throw new Error("This coupon has reached its usage limit.");
  if (coupon.funding === "VENDOR" && (!coupon.vendorId || (vendorSubtotals.get(coupon.vendorId) ?? 0) === 0)) throw new Error("This coupon only applies to eligible products from its sponsor shop.");
  const eligiblePaise = coupon.funding === "VENDOR" ? vendorSubtotals.get(coupon.vendorId!) ?? 0 : subtotalPaise;
  if (eligiblePaise < coupon.minimumOrderPaise) throw new Error("Your eligible item total is below this coupon's minimum.");
  let discountPaise = coupon.discountType === "FIXED" ? Math.round(coupon.value) : Math.round(eligiblePaise * coupon.value / 100);
  if (coupon.maxDiscountPaise !== null) discountPaise = Math.min(discountPaise, coupon.maxDiscountPaise);
  discountPaise = Math.min(discountPaise, Math.max(0, eligiblePaise - 1));
  if (discountPaise < 1) throw new Error("This coupon does not apply a discount to these items.");
  return { eligiblePaise, discountPaise };
}

async function coupons() { return getMongoCollection<CouponRecord & Document>("coupons"); }
async function reservations() { return getMongoCollection<CouponReservation & Document>("couponReservations"); }

export async function getCoupon(code: string) {
  const collection = await coupons();
  if (!collection) throw new Error("MongoDB is unavailable. Coupon validation is unavailable.");
  return collection.findOne({ code: code.trim().toUpperCase() });
}

export async function reserveCoupon(input: { code: string; reservationKey: string; customerId: string; subtotalPaise: number; vendorSubtotals: Map<string, number> }) {
  const reservationKey = input.reservationKey;
  const now = new Date();
  const [couponCollection, reservationCollection] = await Promise.all([coupons(), reservations()]);
  if (!couponCollection || !reservationCollection) throw new Error("MongoDB is unavailable. Coupon validation is unavailable.");
  let prior = await reservationCollection.findOne({ reservationKey });
  const code = input.code.trim().toUpperCase();
  if (prior?.status === "RESERVED" && prior.code === code) return prior as ReservedCoupon;
  if (prior?.status === "RESERVED" && prior.code !== code) {
    await finishCouponReservation(reservationKey, "RELEASED");
    prior = { ...prior, status: "RELEASED" };
  }
  const coupon = await couponCollection.findOne({ code });
  if (!coupon) throw new Error("This coupon is invalid or inactive.");
  const { discountPaise } = calculateCouponDiscount(coupon, input.subtotalPaise, input.vendorSubtotals);

  const reservation: CouponReservation = { reservationKey: input.reservationKey, customerId: input.customerId, couponId: coupon._id, code, funding: coupon.funding, vendorId: coupon.vendorId, discountPaise, status: "RESERVED", createdAt: now };
  if (prior?.status === "RELEASED") {
    const reactivated = await reservationCollection.updateOne({ reservationKey, status: "RELEASED" }, { $set: { ...reservation }, $unset: { finishedAt: "" } });
    if (reactivated.modifiedCount !== 1) throw new Error("This coupon attempt changed. Retry checkout.");
    const capacity = await couponCollection.updateOne({ _id: coupon._id, active: true, $expr: { $lt: [{ $add: ["$usedCount", "$reservedCount"] }, "$usageLimit"] } }, { $inc: { reservedCount: 1 } });
    if (capacity.modifiedCount !== 1) {
      await reservationCollection.updateOne({ reservationKey, status: "RESERVED" }, { $set: { status: "RELEASED" } });
      throw new Error("This coupon has reached its usage limit.");
    }
    return reservation;
  }
  try { await reservationCollection.insertOne(reservation); }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      const duplicate = await reservationCollection.findOne({ reservationKey });
      if (duplicate?.status === "RESERVED") return duplicate as ReservedCoupon;
    }
    throw error;
  }
  const reserved = await couponCollection.updateOne({ _id: coupon._id, active: true, $expr: { $lt: [{ $add: ["$usedCount", "$reservedCount"] }, "$usageLimit"] } }, { $inc: { reservedCount: 1 } });
  if (reserved.modifiedCount !== 1) {
    await reservationCollection.deleteOne({ reservationKey, status: "RESERVED" });
    throw new Error("This coupon has reached its usage limit.");
  }
  return reservation;
}

export async function bindCouponReservation(reservationKey: string, orderId: string) {
  const collection = await reservations();
  if (!collection) return;
  await collection.updateOne({ reservationKey, status: "RESERVED" }, { $set: { orderId } });
}

export async function finishCouponReservation(reservationKey: string | null | undefined, mode: "USED" | "RELEASED") {
  if (!reservationKey) return;
  const [couponCollection, reservationCollection] = await Promise.all([coupons(), reservations()]);
  if (!couponCollection || !reservationCollection) return;
  const reservation = await reservationCollection.findOneAndUpdate({ reservationKey, status: "RESERVED" }, { $set: { status: mode, finishedAt: new Date() } }, { returnDocument: "before" });
  if (!reservation) return;
  await couponCollection.updateOne({ _id: reservation.couponId }, { $inc: { reservedCount: -1, ...(mode === "USED" ? { usedCount: 1 } : {}) } });
}

export async function restoreUsedCouponReservation(orderId: string) {
  const [couponCollection, reservationCollection] = await Promise.all([coupons(), reservations()]);
  if (!couponCollection || !reservationCollection) return;
  const reservation = await reservationCollection.findOneAndUpdate({ orderId, status: "USED" }, { $set: { status: "RELEASED", finishedAt: new Date() } }, { returnDocument: "before" });
  if (reservation) await couponCollection.updateOne({ _id: reservation.couponId }, { $inc: { usedCount: -1 } });
}

export async function createCouponRecord(coupon: Omit<CouponRecord, "_id" | "usedCount" | "reservedCount" | "createdAt">) {
  const collection = await coupons();
  if (!collection) throw new Error("MongoDB is unavailable. Coupons cannot be saved right now.");
  await collection.insertOne({ ...coupon, _id: new ObjectId(), usedCount: 0, reservedCount: 0, createdAt: new Date() });
}

export async function listCoupons() {
  const collection = await coupons();
  if (!collection) return null;
  return (await collection.find({}).sort({ createdAt: -1 }).limit(100).toArray()).map((coupon) => ({ ...coupon, _id: coupon._id.toString() }));
}

export async function setCouponActive(id: string, active: boolean) {
  if (!ObjectId.isValid(id)) return false;
  const collection = await coupons();
  if (!collection) throw new Error("MongoDB is unavailable. Coupons cannot be updated right now.");
  const result = await collection.updateOne({ _id: new ObjectId(id) }, { $set: { active } });
  return result.modifiedCount === 1;
}
