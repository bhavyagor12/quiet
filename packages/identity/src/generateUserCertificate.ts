import { Integer, BitString, OctetString, PrintableString } from 'asn1js'

import config from './config'
import { loadCertificate, loadPrivateKey, loadCSR, ExtensionsTypes, CertFieldsTypes } from './common'
import {
  Certificate, Extension, ExtKeyUsage, BasicConstraints, CertificationRequest
} from 'pkijs'

export interface UserCert {
  // Todo: move types to separate file
  userCertObject: {
    certificate: Certificate;
  }
  userCertString: string
}

export const createUserCert = async (
  rootCA: string,
  rootKey: string,
  userCsr: string,
  notBeforeDate: Date,
  notAfterDate: Date
): Promise<UserCert> => {
  const { hashAlg, signAlg } = config
  const userCertificate = await generateuserCertificate({
    issuerCert: loadCertificate(rootCA),
    issuerKey: await loadPrivateKey(rootKey, signAlg),
    pkcs10: await loadCSR(userCsr),
    hashAlg,
    notBeforeDate,
    notAfterDate
  })

  const userCert = userCertificate.certificate.toSchema(true).toBER(false)
  return {
    userCertObject: userCertificate,
    userCertString: Buffer.from(userCert).toString('base64')
  }
}

async function generateuserCertificate ({
  issuerCert,
  issuerKey,
  pkcs10,
  hashAlg = config.hashAlg,
  notBeforeDate,
  notAfterDate
}: {
  issuerCert: Certificate
  issuerKey: CryptoKey
  pkcs10: CertificationRequest
  hashAlg: string
  notBeforeDate: Date
  notAfterDate: Date
}): Promise<{ certificate: Certificate; }> {
  const basicConstr = new BasicConstraints({ cA: false })
  const keyUsage = getKeyUsage()
  const extKeyUsage = new ExtKeyUsage({
    keyPurposes: [
      '1.3.6.1.5.5.7.3.2', // id-kp-clientAuth
      '1.3.6.1.5.5.7.3.1' // id-kp-serverAuth
    ]
  })
  const attr = pkcs10.attributes as any
  let dmPubKey = null
  let zbayNickName = null
  let peerId = null

  try {
    dmPubKey = attr?.[0].values[0].valueBlock.value[1].valueBlock.value[1].valueBlock.value[0].valueBlock.valueHex
    zbayNickName = attr?.[0].values[0].valueBlock.value[2].valueBlock.value[1].valueBlock.value[0].valueBlock.value
    peerId = attr?.[0].values[0].valueBlock.value[3].valueBlock.value[1].valueBlock.value[0].valueBlock.value
  } catch (err) {
    throw new Error('Cannot get certificate request extension')
  }

  const certificate = new Certificate({
    serialNumber: new Integer({ value: new Date().getTime() }),
    extensions: [
      new Extension({
        extnID: ExtensionsTypes.basicConstr,
        critical: false,
        extnValue: basicConstr.toSchema().toBER(false),
        parsedValue: basicConstr // Parsed value for well-known extensions
      }),
      new Extension({
        extnID: ExtensionsTypes.keyUsage,
        critical: false,
        extnValue: keyUsage.toBER(false),
        parsedValue: keyUsage // Parsed value for well-known extensions
      }),
      new Extension({
        extnID: ExtensionsTypes.extKeyUsage,
        critical: false,
        extnValue: extKeyUsage.toSchema().toBER(false),
        parsedValue: extKeyUsage // Parsed value for well-known extensions
      }),
      new Extension({
        extnID: CertFieldsTypes.dmPublicKey,
        critical: false,
        extnValue: new OctetString({ valueHex: dmPubKey }).toBER(false)
      }),
      new Extension({
        extnID: CertFieldsTypes.nickName,
        critical: false,
        extnValue: new PrintableString({ value: zbayNickName }).toBER(false)
      }),
      new Extension({
        extnID: CertFieldsTypes.peerId,
        critical: false,
        extnValue: new PrintableString({ value: peerId }).toBER(false)
      })
    ],
    issuer: issuerCert.subject,
    subject: pkcs10.subject,
    subjectPublicKeyInfo: pkcs10.subjectPublicKeyInfo
  })
  certificate.notBefore.value = notBeforeDate
  certificate.notAfter.value = notAfterDate
  await certificate.sign(issuerKey, hashAlg)
  return { certificate }
}

function getKeyUsage () {
  const bitArray = new ArrayBuffer(1)
  const bitView = new Uint8Array(bitArray)

  bitView[0] |= 0x02 // Key usage 'cRLSign' flag
  bitView[0] |= 0x04 // Key usage 'keyCertSign' flag
  bitView[0] |= 0x08 // Key usage 'keyAgreement' flag

  return new BitString({ valueHex: bitArray })
}
