package expo.modules.dailynative

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import expo.modules.kotlin.exception.CodedException
import java.security.MessageDigest
import java.security.SecureRandom

/** "Continue with Google" through Credential Manager: the system account sheet, no browser. */
object GoogleSignIn {
  fun sha256Hex(s: String): String =
    MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

  /** Raw nonce for Supabase, and its SHA-256 for Google, which signs it into the id token so the token can't be replayed. */
  fun nonce(): Pair<String, String> {
    val raw = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
    return raw to sha256Hex(raw)
  }

  suspend fun signIn(activity: Activity, webClientId: String): Map<String, Any?> {
    val (raw, hashed) = nonce()
    val option = GetSignInWithGoogleOption.Builder(webClientId).setNonce(hashed).build()
    val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
    val result = try {
      CredentialManager.create(activity).getCredential(activity, request)
    } catch (e: GetCredentialCancellationException) {
      throw CodedException("cancelled", "Sign-in cancelled", e)
    } catch (e: NoCredentialException) {
      throw CodedException("no_account", "No Google account on this phone", e)
    } catch (e: GetCredentialException) {
      throw CodedException("failed", e.type, e)
    }
    val c = result.credential
    if (c !is CustomCredential || c.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
      throw CodedException("failed", "Unexpected credential", null)
    }
    val g = GoogleIdTokenCredential.createFrom(c.data)
    return mapOf("idToken" to g.idToken, "rawNonce" to raw, "email" to g.id, "name" to g.displayName, "photoUrl" to g.profilePictureUri?.toString())
  }
}
