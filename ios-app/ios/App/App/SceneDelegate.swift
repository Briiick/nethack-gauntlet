import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var saveTask: UIBackgroundTaskIdentifier = .invalid

    // Leaving the app saves the game (as NetHack's S command does; see mobile/js/main.js). Ask iOS
    // for a few seconds of background time so the save is written before the app is suspended.
    func sceneDidEnterBackground(_ scene: UIScene) {
        endSaveTask()
        saveTask = UIApplication.shared.beginBackgroundTask(withName: "Save the game") { [weak self] in self?.endSaveTask() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in self?.endSaveTask() }
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        endSaveTask()
    }

    private func endSaveTask() {
        guard saveTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(saveTask)
        saveTask = .invalid
    }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
