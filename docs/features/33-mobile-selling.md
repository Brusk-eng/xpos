# Selling on XPOS Mobile

For cashiers using the XPOS Mobile app (Android). Needs ERPNext 16 with XPOS, and a user assigned to a POS Profile.

## Start of day

1. Open the app, enter your server address, sign in with your ERPNext user. If you are assigned to more than one POS Profile, choose the one this device sells for.
2. Set a 6-digit PIN (first time only). It unlocks this device; it is not your ERPNext password.
3. Wait for the catalog the first time (a large catalog takes a short while). Later it only fetches changes. **Device** shows when it was last refreshed.
4. If the cart shows **Open shift to start selling**, tap it and enter the opening amount for each payment method.

## Making a sale

1. Search by the start of a name or code, or scan a barcode. Items marked **No price** cannot be sold: ask a manager to add a price in ERPNext. An item priced 0.00 can be added, but ERPNext refuses the sale unless the POS Profile allows zero-priced items. Barcodes sold in another unit (a box, a case) are not supported yet and report "not found".
2. Change layout any time (Catalog, Scan, Fashion). The cart stays.
3. Tap **Charge**. The app asks ERPNext for the amount due (prices, taxes, rounding). Choose how the customer pays; for cash enter what they hand over and the app shows the change. For card or transfer, enter the terminal or transfer reference (required when your company marks that method as needing one) and tick the cashier-confirmed box. The receipt shows "(cashier-confirmed)": XPOS does not check the payment with the terminal or bank, and the sale records what you entered.
4. Tap **Take payment**. The sale is saved on the device first, then sent to ERPNext. The receipt shows **Posted to ERPNext as <invoice>** when ERPNext has created it. Printing is not available yet.

## When something goes wrong

Nothing you have charged is ever lost or deleted. The **Sales** tab lists every sale with its status:

- **Held / no answer**: the connection or your session was lost. The sale will be sent again automatically with the same sale id, so it can never be posted twice. If your session expired, a **Sign in again** box appears; your cart is kept.
- **Prices changed**: ERPNext priced the sale differently from what you were shown. Tap **Review new prices**, take payment for the new amount, and it is sent again.
- **Rejected**: ERPNext refused the sale (for example stock or a rule). It stays on the device for a manager to reconcile; tell your manager.
- **Fiscal pending**: the invoice exists but its fiscal (FBR) step is not finished. It is not complete and no new sale can start on this device until it is finished in the web POS.

Offline: you can still search the last catalog, but **Charge** is switched off until the device is online, because stock, serial/batch and receipt checks need the server. Sales already saved are sent when you are back online.
