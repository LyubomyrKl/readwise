# PresignResponse


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**bookId** | **string** | Created book ID | [default to undefined]
**storageKey** | **string** | Storage key for book file | [default to undefined]
**presignUploadInfo** | [**PresignInfo**](PresignInfo.md) | Presigned upload info for book file | [default to undefined]
**customCoverStorageKey** | **string** | Storage key for custom cover file | [optional] [default to undefined]
**customCoverPresignInfo** | [**PresignInfo**](PresignInfo.md) | Presigned upload info for custom cover | [optional] [default to undefined]

## Example

```typescript
import { PresignResponse } from './api';

const instance: PresignResponse = {
    bookId,
    storageKey,
    presignUploadInfo,
    customCoverStorageKey,
    customCoverPresignInfo,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
