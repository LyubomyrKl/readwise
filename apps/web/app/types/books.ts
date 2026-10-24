export interface IBookDetail {
  id: string;
  title: string;
  author: string;
  cover: string;
  spentHours: number;
  pageCount: number;
  pagePassCount: number;
  isFinished: boolean;
  isFavorite: boolean;
}

export interface IBookItemProps {
  onButtonPress?: (id: string) => void;
  isMostRecent?: boolean;
  bookDetail: IBookDetail;
}

export interface IQuote {
  quoteId: string;
  quote: string;
}
