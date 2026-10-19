# Sales Orders & Quotations

Some sales are not handed over at the counter. The customer orders ahead, the goods are
bulky and delivered later, or a business wants a quotation before it commits. X POS lets the
cashier run that whole chain without leaving the till:

**Quotation → Sales Order (with a deposit) → one or more invoices against the order**

Everything is saved as standard ERPNext documents, so the orders, deposits and invoices are
also visible in Desk.

---

## Enabling it

The feature is **off by default**.

| Where | Setting | Effect |
|---|---|---|
| POS Profile | **Allow Sales Order** | Shows *Save as sales order* / *Save as quotation* in the cart and the **Sales Orders** screen |
| Role (Desk) | *Sales User* or any role that can create and submit **Sales Order** and **Quotation** | The documents are saved with the cashier's own ERPNext permissions |

A cashier without permission to create Sales Orders sees the menu entries, but saving fails
with ERPNext's usual "Not permitted" message. Give the role the permission, or remove
*Allow Sales Order* from that profile.

> **Deposits need Sales Invoice mode.** A deposit is deducted when the order is billed, and only
> a Sales Invoice can do that. If **POS Settings → Invoice Type** is *POS Invoice*, the deposit
> field is hidden, and an order that already has a deposit must be billed in Desk.

---

## Save the cart as a Sales Order

1. Ring up the items and pick the customer, as for a normal sale.
2. Open **More** in the cart and choose **Save as sales order**.
3. Fill in the order details:

   | Field | Notes |
   |---|---|
   | **Delivery date** | Defaults to today. It cannot be in the past. |
   | **Per-line delivery dates** | Optional. Use *Set per-line delivery dates* when items arrive on different days. A line left empty uses the order date. |
   | **Customer PO** | Optional. The customer's own order number. |
   | **Shipping address** | The customer's addresses on file. The shipping or primary address is selected for you. |
   | **Project** | Optional. |
   | **Notes** | Saved as a comment on the order. |
   | **Deposit** | Optional. The amount taken now and the mode of payment. It cannot be more than the order total. |

4. Press **Save Order**.

The order is submitted straight away and the cart is cleared for the next customer. A deposit
is recorded as a Payment Entry against the order, so the order shows it as *Advance Paid*.

Prices follow the same rules as a sale: the price list, unless the cashier's POS Role has
**Change Price**, and line discounts limited by the profile's maximum discount.

## Save the cart as a Quotation

Choose **More → Save as quotation**. Enter an optional **Valid till** date, a shipping address
and notes, then press **Save Quotation**. A quotation takes no deposit.

---

## The Sales Orders screen

Open **Sales Orders** from the top bar or the sidebar. It has two tabs:

- **Sales Orders**: submitted orders that still have something to bill, with the deposit
  paid and how much is billed so far.
- **Quotations**: submitted quotations that are still open and within their validity date.
  Expired quotations are listed only if **Selling Settings → Allow Sales Order Creation For
  Expired Quotation** is on.

Search by document number or customer name.

### Bill an order

1. Find the order and press **Load into cart**. If the cart already holds items, you are asked
   to replace them.
2. The cart shows **Billing Sales Order …** and loads whatever is still unbilled on the order,
   at the price agreed on the order.
3. Lower a quantity to bill part of the order now and the rest later. You cannot bill more than
   is left on the order.
4. Any deposit appears as **Deposit on …** and comes off the total. Take payment for the rest
   as usual.

The invoice stays linked to the order: ERPNext updates the order's *% Billed*, and the deposit
is allocated to the invoice. When part of an order is billed, the order stays on the list
until it is fully billed. If the deposit is larger than what you bill now, the unused part
stays on the order for the next invoice.

Whether stock leaves the shop at the counter follows the profile's **Update Stock** setting,
just like any sale. If it is off, deliver later with a Delivery Note from Desk.

A cart that is billing a Sales Order cannot be put on **Hold**. Take payment or clear the cart.

### Take up a quotation

Press **Load into cart** on the quotation. The cart shows **From Quotation …** with the quoted
items and prices. Then either:

- **take payment** to sell it now, at the quoted prices, or
- choose **More → Save as sales order** to turn it into an order. The quotation is then marked
  *Ordered*.

---

## Good to know

- Saving an order or quotation needs a connection. The menu entries are disabled while offline.
- Pricing rules and the customer's price list do not reprice lines loaded from an order or a
  quotation. They keep the agreed price.
- The deposit is paid into the account of the chosen mode of payment, like a settlement of an
  unpaid invoice. It is not part of the shift's expected closing amount.
