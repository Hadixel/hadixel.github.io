// What the gateway accepts about a navigation menu.
//
// A menu is a *tree*: items nest, and each item carries a target, an optional category source, promos
// and its own children. `menuSchema` in the schema package is what says the tree is well-formed —
// including that children are at most twenty deep and promos at most eight — and it is the service's
// to run, because a decorator on a field cannot see the field's siblings or its descendants.
//
// What is shape lives here: that the location is one of three, that the name is text with something
// in it, and that the item list is a list.

import { ArrayMaxSize, IsArray, IsEnum, IsNotEmpty, IsString, Length, Matches } from "class-validator";

/** `/\S/`, because `@IsNotEmpty` accepts three spaces and a menu named `"   "` renders as a blank tab. */
const HAS_CONTENT = /\S/;

/**
 * The most items across the whole tree, and the deepest it may nest.
 *
 * 200 and 5, both carried over from the panel. The tree is replaced wholesale in one transaction, so an
 * unbounded one is a request that holds a transaction open for as long as a client takes to send it —
 * and a nav that nests fifteen levels is a nav nobody can click through.
 */
const MAX_TOTAL_ITEMS = 200;
const MAX_DEPTH = 5;

/** The most characters the tree may occupy before it is parsed. */
const MAX_TREE_BYTES = 200_000;

export enum MenuLocationDto {
  HEADER = "HEADER",
  FOOTER = "FOOTER",
  MOBILE = "MOBILE",
}

export class SaveNavDto {
  @IsEnum(MenuLocationDto, { message: "موقعیت منو نامعتبر است." })
  location!: MenuLocationDto;

  @IsString({ message: "نام منو باید متن باشد." })
  @IsNotEmpty({ message: "نام منو الزامی است." })
  @Matches(HAS_CONTENT, { message: "نام منو الزامی است." })
  @Length(1, 200, { message: "نام منو بیش از حد طولانی است." })
  name!: string;

  /**
   * The whole tree, as a set to replace.
   *
   * Replace, because that is what the editor means: it sends every item the menu has, and an item it
   * no longer sends is one the operator removed. A patch-style API would need a separate "delete these
   * ids" list, and the editor cannot tell "I deleted this row" from "this row never loaded".
   */
  @IsArray({ message: "ساختار منو باید فهرست باشد." })
  @ArrayMaxSize(MAX_TOTAL_ITEMS, { message: "تعداد آیتم‌های منو بیش از حد مجاز است." })
  items!: unknown[];
}

export { MAX_DEPTH, MAX_TOTAL_ITEMS, MAX_TREE_BYTES };
