const msRestAzure = require('ms-rest-azure')
const StorageManagementClient = require('azure-arm-storage')
const azureStorage = require('azure-storage')

async function createStorage(
  { name, blobContainer, subscriptionId, resourceGroup, tenant, clientId, clientSecret, location },
  context
) {
  const credentials = new msRestAzure.ApplicationTokenCredentials(clientId, tenant, clientSecret)
  const storageClient = new StorageManagementClient(credentials, subscriptionId)

  context.log(`Creating storage account: ${name}`)
  let storageParameters = {
    location: location,
    sku: {
      name: 'Standard_LRS'
    },
    kind: 'Storage'
  }

  await storageClient.storageAccounts.create(resourceGroup, name, storageParameters)

  let storageKeyResult = await storageClient.storageAccounts.listKeys(resourceGroup, name)

  let storageKey = storageKeyResult.keys[0].value
  let connectionString = `DefaultEndpointsProtocol=https;AccountName=${name};AccountKey=${storageKey};EndpointSuffix=core.windows.net`

  let blobClient = azureStorage.createBlobService(connectionString)

  context.log(`Creating container: ${blobContainer}`)
  return new Promise((resolve) => {
    blobClient.createContainerIfNotExists(blobContainer, (err) => {
      if (err) throw err
      resolve({
        name,
        blobContainer,
        connectionString
      })
    })
  })
}

async function deploy(inputs, context) {
  let outputs = await createStorage(inputs, context)
  context.log(`Container created.`)

  context.saveState({ ...outputs })
  return outputs
}

function remove(inputs, context) {
  context.log('removing storage')
}

module.exports = {
  deploy,
  remove
}
