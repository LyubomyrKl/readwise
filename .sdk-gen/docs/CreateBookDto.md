# CreateBookDto


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**title** | **string** | Book title | [default to undefined]
**author** | **string** | Book author | [default to undefined]
**description** | **string** | Book description | [default to undefined]
**filename** | **string** | Original filename | [default to undefined]
**mime** | **string** | MIME type of the book file | [default to undefined]
**sizeBytes** | **number** | File size in bytes | [default to undefined]
**customCoverFilename** | **string** | Custom cover filename | [optional] [default to undefined]
**customCoverMime** | **string** | Custom cover MIME type | [optional] [default to undefined]
**customCoverSizeBytes** | **number** | Custom cover file size in bytes | [optional] [default to undefined]

## Example

```typescript
import { CreateBookDto } from './api';

const instance: CreateBookDto = {
    title,
    author,
    description,
    filename,
    mime,
    sizeBytes,
    customCoverFilename,
    customCoverMime,
    customCoverSizeBytes,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
