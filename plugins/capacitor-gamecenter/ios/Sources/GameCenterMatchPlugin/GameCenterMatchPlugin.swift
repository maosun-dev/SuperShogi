// 傾将棋の友と対局（Game Center）：合言葉から作った番号（playerGroup）で相手を探し、GKMatch でつなぐ。
// 決まりごとは持たず、サインイン・探す・つながった・失敗した・送る・受け取る・切れた だけを JS（src/net/gcLink.ts）に渡す。
// 誘う側と入れる側が必ず1人ずつになるよう、playerAttributes を補い合う形にする
import Foundation
import Capacitor
import GameKit

@objc(GameCenterMatchPlugin)
public class GameCenterMatchPlugin: CAPPlugin, CAPBridgedPlugin, GKMatchDelegate {
    public let identifier = "GameCenterMatchPlugin"
    public let jsName = "GameCenterMatch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "find", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private static let hostAttributes: UInt32 = 0xFFFF0000
    private static let guestAttributes: UInt32 = 0x0000FFFF

    private var pendingSignIn: [CAPPluginCall] = []
    private var handlerSet = false
    private var signInDone = false       // Apple の答えが一度でも来たか（来たあとは待たずに今の状態を返す）
    private var match: GKMatch?
    private var searching = false
    private var searchId = 0             // 古い探しの返事を捨てるための番号
    private var timeout: DispatchWorkItem?
    private var announced = false        // つながったの知らせは1つの対局で1回だけ

    // ---- サインイン（転落牌の GameCenter.swift と同じ作り） ----

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let player = GKLocalPlayer.local
            if player.isAuthenticated { call.resolve(["signedIn": true]); return }
            // 一度断られたあとは、Apple はアプリが表に戻るまで答え直さないので、待たずに返す
            if self.handlerSet && self.signInDone { call.resolve(["signedIn": false]); return }
            self.pendingSignIn.append(call)
            if self.handlerSet { return }
            self.handlerSet = true
            // Apple の決まりで、この関数はアプリの起動中に何度も呼ばれることがある
            player.authenticateHandler = { [weak self] vc, _ in
                guard let self = self else { return }
                if let vc = vc {
                    self.bridge?.viewController?.present(vc, animated: true)
                    return
                }
                self.signInDone = true
                let signedIn = GKLocalPlayer.local.isAuthenticated
                let calls = self.pendingSignIn
                self.pendingSignIn = []
                calls.forEach { $0.resolve(["signedIn": signedIn]) }
            }
        }
    }

    // ---- 探す ----

    @objc func find(_ call: CAPPluginCall) {
        guard let group = call.getInt("group") else { call.reject("番号（group）がありません"); return }
        let host = call.getBool("host") ?? false
        let timeoutSec = call.getInt("timeoutSec") ?? 0
        DispatchQueue.main.async {
            call.resolve()
            guard GKLocalPlayer.local.isAuthenticated else {
                self.notifyListeners("failed", data: ["reason": "signedOut"])
                return
            }
            self.cleanUp()
            self.searchId += 1
            let id = self.searchId
            let request = GKMatchRequest()
            request.minPlayers = 2
            request.maxPlayers = 2
            request.playerGroup = group
            request.playerAttributes = host ? Self.hostAttributes : Self.guestAttributes
            self.searching = true
            if timeoutSec > 0 {
                let work = DispatchWorkItem { [weak self] in
                    guard let self = self, self.searchId == id, self.searching else { return }
                    self.searching = false
                    GKMatchmaker.shared().cancel()
                    self.notifyListeners("failed", data: ["reason": "timeout"])
                }
                self.timeout = work
                DispatchQueue.main.asyncAfter(deadline: .now() + .seconds(timeoutSec), execute: work)
            }
            GKMatchmaker.shared().findMatch(for: request) { [weak self] found, error in
                DispatchQueue.main.async {
                    guard let self = self, self.searchId == id, self.searching else {
                        found?.disconnect()   // 取り消したあとに届いた相手は捨てる
                        return
                    }
                    self.searching = false
                    self.timeout?.cancel()
                    self.timeout = nil
                    if let error = error {
                        self.notifyListeners("failed", data: ["reason": error.localizedDescription])
                        return
                    }
                    guard let found = found else {
                        self.notifyListeners("failed", data: ["reason": "noMatch"])
                        return
                    }
                    self.match = found
                    found.delegate = self
                    if found.expectedPlayerCount == 0 { self.announceConnected() }
                }
            }
        }
    }

    // ---- 送る・やめる ----

    @objc func send(_ call: CAPPluginCall) {
        guard let text = call.getString("data") else { call.reject("送るもの（data）がありません"); return }
        DispatchQueue.main.async {
            guard let m = self.match else { call.resolve(); return } // つながっていなければ捨てる
            do {
                try m.sendData(toAllPlayers: Data(text.utf8), with: .reliable)
                call.resolve()
            } catch {
                call.reject("送れませんでした：\(error.localizedDescription)")
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.cleanUp()
            call.resolve()
        }
    }

    /// 探すのを取り消し、対局から抜ける（知らせは出さない）
    private func cleanUp() {
        searchId += 1
        if searching { GKMatchmaker.shared().cancel() }
        searching = false
        timeout?.cancel()
        timeout = nil
        match?.delegate = nil
        match?.disconnect()
        match = nil
        announced = false
    }

    private func announceConnected() {
        if announced { return }
        announced = true
        notifyListeners("connected", data: [:])
    }

    // ---- GKMatchDelegate ----

    public func match(_ match: GKMatch, player: GKPlayer, didChange state: GKPlayerConnectionState) {
        DispatchQueue.main.async {
            guard match === self.match else { return }
            switch state {
            case .connected:
                if match.expectedPlayerCount == 0 { self.announceConnected() }
            case .disconnected:
                // 一度切れた GKMatch には戻れないので捨てる（つなぎ直しは JS が同じ合言葉で探し直す）
                self.dropMatch()
            default:
                break
            }
        }
    }

    public func match(_ match: GKMatch, didReceive data: Data, fromRemotePlayer player: GKPlayer) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async {
            guard match === self.match else { return }
            // 相手の connected より先に合図が届くことがある。つながったを先に知らせないと、JS が返事を捨てる
            self.announceConnected()
            self.notifyListeners("message", data: ["data": text])
        }
    }

    public func match(_ match: GKMatch, didFailWithError error: Error?) {
        DispatchQueue.main.async {
            guard match === self.match else { return }
            self.dropMatch()
        }
    }

    /// 相手が切れた。つながったと知らせる前に終わったなら「失敗した」（誘う側は探し直し、入れる側は知らせる）
    private func dropMatch() {
        let wasAnnounced = announced
        match?.delegate = nil
        match?.disconnect()
        match = nil
        announced = false
        if wasAnnounced { notifyListeners("disconnected", data: [:]) }
        else { notifyListeners("failed", data: ["reason": "noConnect"]) }
    }
}
