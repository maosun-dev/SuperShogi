// 傾将棋の友と対局：近くの iPhone 同士を MultipeerConnectivity（Bluetooth とルーターなしの Wi-Fi を iOS が使い分ける）でつなぐ。
// 決まりごとは持たず、誘う・探す・つなぐ・送る・受け取る・切れた の知らせだけを JS（src/net/link.ts）に渡す。
// 相手は1人だけ。相手の id は MCPeerID ごとに作った UUID の文字列
import Foundation
import Capacitor
import MultipeerConnectivity

@objc(NearbyPlugin)
public class NearbyPlugin: CAPPlugin, CAPBridgedPlugin, MCSessionDelegate, MCNearbyServiceAdvertiserDelegate, MCNearbyServiceBrowserDelegate {
    public let identifier = "NearbyPlugin"
    public let jsName = "Nearby"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "host", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "browse", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "join", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    // Info.plist の NSBonjourServices（_super-shogi._tcp / _super-shogi._udp）と同じ名前
    private let serviceType = "super-shogi"
    private var session: MCSession?
    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?
    private var hostName: String?                       // 誘っているときの合言葉
    private var peerById: [String: MCPeerID] = [:]
    private var idByPeer: [MCPeerID: String] = [:]
    private var nameByPeer: [MCPeerID: String] = [:]    // 見つけた相手の合言葉
    private var connected: Set<MCPeerID> = []

    private func peerId(_ peer: MCPeerID) -> String {
        if let id = idByPeer[peer] { return id }
        let id = UUID().uuidString
        idByPeer[peer] = id
        peerById[id] = peer
        return id
    }

    /// 誘う・探す・つながりを全部やめる
    private func teardown() {
        advertiser?.stopAdvertisingPeer()
        advertiser?.delegate = nil
        advertiser = nil
        browser?.stopBrowsingForPeers()
        browser?.delegate = nil
        browser = nil
        session?.delegate = nil
        session?.disconnect()
        session = nil
        hostName = nil
        connected.removeAll()
        peerById.removeAll()
        idByPeer.removeAll()
        nameByPeer.removeAll()
    }

    private func newSession(_ displayName: String) -> MCSession {
        teardown()
        let me = MCPeerID(displayName: displayName)
        // 暗号はかけない。鍵の取り決めでつなぐのが遅れたり失敗したりするため（送るのは指し手と札だけで、個人の情報はない）
        let s = MCSession(peer: me, securityIdentity: nil, encryptionPreference: .none)
        s.delegate = self
        session = s
        return s
    }

    // ---- JS から呼ぶ ----

    @objc func host(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else { call.reject("合言葉（name）がありません"); return }
        DispatchQueue.main.async {
            let s = self.newSession("host")
            self.hostName = name
            let adv = MCNearbyServiceAdvertiser(peer: s.myPeerID, discoveryInfo: ["name": name], serviceType: self.serviceType)
            adv.delegate = self
            adv.startAdvertisingPeer()
            self.advertiser = adv
            call.resolve()
        }
    }

    @objc func browse(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let s = self.newSession("guest")
            let b = MCNearbyServiceBrowser(peer: s.myPeerID, serviceType: self.serviceType)
            b.delegate = self
            b.startBrowsingForPeers()
            self.browser = b
            call.resolve()
        }
    }

    @objc func join(_ call: CAPPluginCall) {
        guard let id = call.getString("peer") else { call.reject("相手（peer）がありません"); return }
        DispatchQueue.main.async {
            guard let peer = self.peerById[id], let s = self.session, let b = self.browser else {
                call.reject("その相手は見つかっていません")
                return
            }
            b.invitePeer(peer, to: s, withContext: nil, timeout: 20)
            call.resolve()
        }
    }

    @objc func send(_ call: CAPPluginCall) {
        guard let text = call.getString("data") else { call.reject("送るもの（data）がありません"); return }
        DispatchQueue.main.async {
            guard let s = self.session, !s.connectedPeers.isEmpty else { call.resolve(); return } // つながっていなければ捨てる
            do {
                try s.send(Data(text.utf8), toPeers: s.connectedPeers, with: .reliable)
                call.resolve()
            } catch {
                call.reject("送れませんでした：\(error.localizedDescription)")
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.teardown()
            call.resolve()
        }
    }

    // ---- 誘う側：来た相手は1人だけ受け入れる ----

    public func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID,
                           withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        DispatchQueue.main.async {
            guard let s = self.session, s.connectedPeers.isEmpty else { invitationHandler(false, nil); return }
            invitationHandler(true, s)
        }
    }

    public func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
        CAPLog.print("Nearby: 誘い始められませんでした", error.localizedDescription)
    }

    // ---- 探す側 ----

    public func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        DispatchQueue.main.async {
            guard browser === self.browser else { return }
            let name = info?["name"] ?? ""
            self.nameByPeer[peerID] = name
            self.notifyListeners("found", data: ["peer": self.peerId(peerID), "name": name])
        }
    }

    public func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        DispatchQueue.main.async {
            guard browser === self.browser, let id = self.idByPeer[peerID] else { return }
            self.notifyListeners("lost", data: ["peer": id])
        }
    }

    public func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
        CAPLog.print("Nearby: 探し始められませんでした", error.localizedDescription)
    }

    // ---- つながり ----

    public func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        DispatchQueue.main.async {
            guard session === self.session else { return }
            switch state {
            case .connected:
                self.connected.insert(peerID)
                // 相手は1人だけなので、誘う・探すはここでやめる
                self.advertiser?.stopAdvertisingPeer()
                self.browser?.stopBrowsingForPeers()
                let name = self.nameByPeer[peerID] ?? "guest"
                self.notifyListeners("connected", data: ["peer": self.peerId(peerID), "name": name])
            case .notConnected:
                // つながったことのある相手が切れたら「切れた」。つながる前に終わったら、探す側にだけ「失敗した」と知らせる
                if self.connected.remove(peerID) != nil {
                    self.notifyListeners("disconnected", data: ["peer": self.peerId(peerID)])
                } else if self.browser != nil {
                    self.notifyListeners("failed", data: ["peer": self.peerId(peerID)])
                }
            case .connecting:
                break
            @unknown default:
                break
            }
        }
    }

    public func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async {
            guard session === self.session else { return }
            self.notifyListeners("message", data: ["data": text])
        }
    }

    public func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}

    public func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String,
                        fromPeer peerID: MCPeerID, with progress: Progress) {}

    public func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String,
                        fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}
