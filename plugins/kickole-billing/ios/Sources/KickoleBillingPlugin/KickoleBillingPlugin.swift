import Foundation
import UIKit
import Capacitor
import StoreKit

/**
 * StoreKit 2 adapter for the non-consumable Kickolé Launch Collection.
 * Never logs receipts, tokens or credentials.
 */
@objc(KickoleBillingPlugin)
public class KickoleBillingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KickoleBillingPlugin"
    public let jsName = "KickoleBilling"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getLaunchProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchaseLaunchCollection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refreshEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchaseProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ownedProductIds", returnType: CAPPluginReturnPromise),
    ]

    private let productId = "kickole_launch_collection"
    private var products: [Product] = []
    private var updates: Task<Void, Never>?
    private var foregroundObserver: NSObjectProtocol?
    private var purchaseInFlight = false

    public override func load() {
        updates = Task { [weak self] in
            for await update in Transaction.updates {
                guard let self else { return }
                await self.handle(transactionUpdate: update)
            }
        }
        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { await self.refreshAndNotify() }
        }
    }

    deinit {
        updates?.cancel()
        if let foregroundObserver {
            NotificationCenter.default.removeObserver(foregroundObserver)
        }
    }

    @objc func getLaunchProduct(_ call: CAPPluginCall) {
        Task {
            do {
                let storeProducts = try await Product.products(for: [productId])
                self.products = storeProducts
                guard let product = storeProducts.first else {
                    // Capacitor iOS cannot resolve nil; the JS adapter maps a rejection to null.
                    call.reject("product_unavailable")
                    return
                }
                call.resolve([
                    "productId": product.id,
                    "title": product.displayName,
                    "description": product.description,
                    "priceString": product.displayPrice,
                    "priceMicros": NSDecimalNumber(decimal: product.price * 1_000_000).intValue,
                    "currencyCode": product.priceFormatStyle.currencyCode ?? "",
                ])
            } catch {
                call.reject("product_unavailable")
            }
        }
    }

    @objc func purchaseLaunchCollection(_ call: CAPPluginCall) {
        Task {
            if purchaseInFlight {
                call.resolve(self.resultPayload(outcome: "busy", owned: false, source: "none", ref: nil, message: "Purchase already in progress."))
                return
            }
            purchaseInFlight = true
            defer { purchaseInFlight = false }

            do {
                if products.isEmpty {
                    products = try await Product.products(for: [productId])
                }
                guard let product = products.first(where: { $0.id == productId }) else {
                    call.resolve(self.resultPayload(outcome: "unavailable", owned: false, source: "none", ref: nil, message: "Product is not available in App Store Connect for this build."))
                    return
                }

                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    let transaction = try self.checkVerified(verification)
                    let ref = self.transactionRef(for: transaction)
                    // Deliver entitlement before finishing.
                    self.notifyEntitlement(owned: true, ref: ref)
                    await transaction.finish()
                    call.resolve(self.resultPayload(outcome: "purchased", owned: true, source: "apple", ref: ref, message: nil))
                case .userCancelled:
                    call.resolve(self.resultPayload(outcome: "cancelled", owned: false, source: "none", ref: nil, message: "Purchase cancelled."))
                case .pending:
                    call.resolve(self.resultPayload(outcome: "pending", owned: false, source: "none", ref: nil, message: "Purchase is pending approval. Content unlocks after it completes."))
                @unknown default:
                    call.resolve(self.resultPayload(outcome: "failed", owned: false, source: "none", ref: nil, message: "Purchase could not be completed."))
                }
            } catch {
                call.resolve(self.resultPayload(outcome: "failed", owned: false, source: "none", ref: nil, message: "Purchase could not be completed."))
            }
        }
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                // Sync with App Store without prompting for login unless required by the system.
                try await AppStore.sync()
                if let entitlement = await self.currentEntitlement() {
                    self.notifyEntitlement(owned: true, ref: entitlement.ref)
                    call.resolve(self.resultPayload(outcome: "restored", owned: true, source: "apple", ref: entitlement.ref, message: "Launch Collection restored for this Apple ID."))
                } else {
                    self.notifyEntitlement(owned: false, ref: nil)
                    call.resolve(self.resultPayload(outcome: "restored", owned: false, source: "apple", ref: nil, message: "No Launch Collection purchase found for this Apple ID."))
                }
            } catch {
                call.resolve(self.resultPayload(outcome: "failed", owned: false, source: "none", ref: nil, message: "Could not restore purchases right now."))
            }
        }
    }

    /// Store rows for placeholder pack ids. Omits anything the store does not list.
    @objc func getProducts(_ call: CAPPluginCall) {
        let ids = call.getArray("productIds", String.self) ?? []
        Task {
            do {
                let storeProducts = try await Product.products(for: ids)
                for product in storeProducts where !self.products.contains(where: { $0.id == product.id }) {
                    self.products.append(product)
                }
                let rows: [[String: Any]] = storeProducts.map { product in
                    [
                        "productId": product.id,
                        "title": product.displayName,
                        "description": product.description,
                        "priceString": product.displayPrice,
                        "priceMicros": NSDecimalNumber(decimal: product.price * 1_000_000).intValue,
                        "currencyCode": product.priceFormatStyle.currencyCode ?? "",
                    ]
                }
                call.resolve(["products": rows])
            } catch {
                call.resolve(["products": []])
            }
        }
    }

    /// Non-consumable pack purchase. Does not touch the Launch Collection entitlement.
    @objc func purchaseProduct(_ call: CAPPluginCall) {
        let requested = call.getString("productId") ?? ""
        Task {
            if purchaseInFlight {
                call.resolve(self.packPayload(outcome: "busy", productId: requested, source: "none", message: "Purchase already in progress."))
                return
            }
            guard !requested.isEmpty else {
                call.resolve(self.packPayload(outcome: "unavailable", productId: requested, source: "none", message: "Product is not available in App Store Connect for this build."))
                return
            }
            purchaseInFlight = true
            defer { purchaseInFlight = false }
            do {
                if self.products.first(where: { $0.id == requested }) == nil {
                    let fetched = try await Product.products(for: [requested])
                    self.products.append(contentsOf: fetched)
                }
                guard let product = self.products.first(where: { $0.id == requested }) else {
                    call.resolve(self.packPayload(outcome: "unavailable", productId: requested, source: "none", message: "Product is not available in App Store Connect for this build."))
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    let transaction = try self.checkVerified(verification)
                    await transaction.finish()
                    call.resolve(self.packPayload(outcome: "purchased", productId: product.id, source: "apple", message: nil))
                case .userCancelled:
                    call.resolve(self.packPayload(outcome: "cancelled", productId: requested, source: "none", message: "Purchase cancelled."))
                case .pending:
                    call.resolve(self.packPayload(outcome: "pending", productId: requested, source: "none", message: "Purchase is pending approval. Content unlocks after it completes."))
                @unknown default:
                    call.resolve(self.packPayload(outcome: "failed", productId: requested, source: "none", message: "Purchase could not be completed."))
                }
            } catch {
                call.resolve(self.packPayload(outcome: "failed", productId: requested, source: "none", message: "Purchase could not be completed."))
            }
        }
    }

    /// Every non-revoked entitlement id. The JS layer keeps only known pack ids.
    @objc func ownedProductIds(_ call: CAPPluginCall) {
        Task {
            var ids: [String] = []
            for await result in Transaction.currentEntitlements {
                guard case .verified(let transaction) = result else { continue }
                if transaction.revocationDate == nil {
                    ids.append(transaction.productID)
                }
            }
            call.resolve(["productIds": ids])
        }
    }

    @objc func refreshEntitlements(_ call: CAPPluginCall) {
        Task {
            if let entitlement = await self.currentEntitlement() {
                call.resolve([
                    "owned": true,
                    "source": "apple",
                    "verifiedAt": entitlement.verifiedAt,
                    "transactionRef": entitlement.ref as Any,
                ])
            } else {
                call.resolve([
                    "owned": false,
                    "source": "apple",
                    "verifiedAt": Date().timeIntervalSince1970 * 1000,
                    "transactionRef": NSNull(),
                ])
            }
        }
    }

    private func currentEntitlement() async -> (ref: String, verifiedAt: Double)? {
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            if transaction.productID == productId && transaction.revocationDate == nil {
                return (transactionRef(for: transaction), Date().timeIntervalSince1970 * 1000)
            }
        }
        return nil
    }

    /// Foreground re-check. A missing current entitlement is definitive; a thrown sync is not.
    private func refreshAndNotify() async {
        if let entitlement = await self.currentEntitlement() {
            notifyEntitlement(owned: true, ref: entitlement.ref)
        } else {
            notifyEntitlement(owned: false, ref: nil)
        }
    }

    private func handle(transactionUpdate: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = transactionUpdate else { return }
        guard transaction.productID == productId else {
            await transaction.finish()
            return
        }
        if transaction.revocationDate != nil {
            notifyEntitlement(owned: false, ref: nil)
            await transaction.finish()
            return
        }
        let ref = transactionRef(for: transaction)
        notifyEntitlement(owned: true, ref: ref)
        await transaction.finish()
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw StoreError.failedVerification
        case .verified(let safe):
            return safe
        }
    }

    /// Stable non-secret reference — never the raw receipt.
    private func transactionRef(for transaction: Transaction) -> String {
        let id = String(transaction.id)
        return "apple:" + String(id.prefix(8)) + "…" + String(id.suffix(4))
    }

    private func notifyEntitlement(owned: Bool, ref: String?) {
        notifyListeners("entitlementChanged", data: [
            "owned": owned,
            "source": "apple",
            "verifiedAt": Date().timeIntervalSince1970 * 1000,
            "transactionRef": ref as Any,
        ])
    }

    private func packPayload(outcome: String, productId: String, source: String, message: String?) -> [String: Any] {
        var payload: [String: Any] = [
            "outcome": outcome,
            "productId": productId,
            "source": source,
        ]
        if let message { payload["message"] = message }
        return payload
    }

    private func resultPayload(outcome: String, owned: Bool, source: String, ref: String?, message: String?) -> [String: Any] {
        var payload: [String: Any] = [
            "outcome": outcome,
            "owned": owned,
            "source": source,
            "verifiedAt": Date().timeIntervalSince1970 * 1000,
            "transactionRef": ref as Any,
        ]
        if let message { payload["message"] = message }
        return payload
    }

    private enum StoreError: Error {
        case failedVerification
    }
}
